const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// 输入文件名
const sourceFile = "Record03_05_20_04.json";   // 采购订单数据
const vendorFile = "VendorID_03_05_20_53.json"; // 供应商数据
const csvFile = "WowTracking.csv";             // CSV 文件 (WOW Tracking)
const paidCsvFile = "paid_Feb25.csv";          // 记录了各个 PO 的已付情况
const outputFile = "fullSources.json";         // 输出文件

// 解析 CSV 文件并返回一个 Promise（适用于 WowTracking.csv）
function parseWowTrackingCSV(filePath) {
    return new Promise((resolve, reject) => {
        const results = {};
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                // 这里取 "Vendor Code" 作为 VendorID
                const vendorID = row["Vendor Code"] ? row["Vendor Code"].trim() : "";
                results[vendorID] = {
                    "Wow Payment Terms": row["Payment Terms"] || "",
                    "Deposit Required": row["Deposit Required"] || "",
                    "Prepay G": row["Prepay G"] || "",
                    "Prepay H": row["Prepay H"] || "",
                    "Net Days": row["Net Days (Due post ERD)"] || ""
                };
            })
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

// 解析 paid_Feb25.csv 并返回一个 Promise（适用于已付情况）
function parsePaidCSV(filePath) {
    return new Promise((resolve, reject) => {
        const results = {};
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                // row.PO, row["Debit Amount"]
                const poNumber = row["PO"] ? row["PO"].trim() : "";
                // 转成数值
                const debitAmount = row["Debit Amount"] ? parseFloat(row["Debit Amount"]) : 0;
                results[poNumber] = isNaN(debitAmount) ? 0 : debitAmount;
            })
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

// 执行主流程
async function processFiles() {
    try {
        // 1) 读取采购订单 JSON 数据
        const sourceDataRaw = fs.readFileSync(sourceFile, 'utf8');
        const sourceData = JSON.parse(sourceDataRaw);

        // 2) 读取供应商 JSON 数据
        const vendorDataRaw = fs.readFileSync(vendorFile, 'utf8');
        const vendorData = JSON.parse(vendorDataRaw);

        if (!sourceData.success || !Array.isArray(sourceData.data)) {
            throw new Error("采购订单 JSON 结构无效");
        }
        if (!Array.isArray(vendorData.items)) {
            throw new Error("供应商 JSON 结构无效");
        }

        // 3) 解析 WowTracking.csv
        console.log("📂 解析 WowTracking.csv...");
        const csvData = await parseWowTrackingCSV(csvFile);

        // 4) 创建一个 entityid -> term_name 映射（含 terms）
        const vendorMap = {};
        vendorData.items.forEach(vendor => {
            vendorMap[vendor.entityid] = {
                term_name: vendor.term_name || "",
                terms: vendor.terms || ""
            };
        });

        console.log("✅ 已建立 Vendor ID -> term_name 的映射");

        // 5) 遍历 sourceData.data，补充 term_name & WOW Tracking 字段
        const updatedData = sourceData.data.map(item => {
            const vendorID = item.ID; // Record03_05_20_04.json 中的 ID 就是 VendorID
            const vendorInfo = vendorMap[vendorID] || { term_name: "", terms: "" };
            const wowInfo = csvData[vendorID] || {
                "Wow Payment Terms": "",
                "Deposit Required": "",
                "Prepay G": "",
                "Prepay H": "",
                "Net Days": ""
            };

            return {
                ...item,
                term_name: vendorInfo.term_name, // 来自 suiteQL 的 vendor.term_name
                Wow_Payment_Terms: wowInfo["Wow Payment Terms"],
                Deposit_Required: wowInfo["Deposit Required"],
                Prepay_G: wowInfo["Prepay G"],
                Prepay_H: wowInfo["Prepay H"],
                Net_Days: wowInfo["Net Days"]
            };
        });

        // 6) 解析 paid_Feb25.csv，用于后面设置 paid 字段
        console.log("📂 解析 paid_Feb25.csv...");
        const paidMap = await parsePaidCSV(paidCsvFile);

        // -------------------------------------------------------
        // 7) 在合并完 updatedData 之后，再做进一步优化
        //    - 按照每个 PO # 分组
        //    - 若存在 "PO Line No.": "0"，则把同一 PO 的其他行合并到这一行
        //    - 字符串拼接 "PO Line No.", "Quantity", "Cost in USD"
        //    - 新增字段 "Balance" = Σ(Quantity_i * Cost_i)
        //    - 只保留 "PO Line No.": "0" 那行，删除其余行
        //    - 最后根据 paid_Feb25.csv 给 "PO #": line["paid"]
        // -------------------------------------------------------

        // 按 PO # 分组
        const poGroups = {};
        updatedData.forEach((line) => {
            const poNum = line["PO #"] || "";
            if (!poGroups[poNum]) {
                poGroups[poNum] = [];
            }
            poGroups[poNum].push(line);
        });

        let removalCount = 0; // 统计被删除行数量
        const finalData = [];

        // 一个小工具函数，用于字符串拼接
        function appendValue(base, addition) {
            // 若 base 为空，就直接返回 addition；否则以逗号连接
            if (!base) return addition;
            if (!addition) return base; // addition 为空就不拼接
            return base + "," + addition;
        }

        Object.keys(poGroups).forEach((poNum) => {
            const group = poGroups[poNum];
            // 查找是否存在 line0
            const line0 = group.find(g => g["PO Line No."] === "0");

            if (!line0) {
                // 如果没有 line0，则保留原本所有行，不做合并
                finalData.push(...group);
            } else {
                // 存在 line0：将其余行合并到 line0
                let balanceSum = 0; // 用于累加 quantity_i * cost_i

                // 遍历本组的所有行
                group.forEach((line) => {
                    // 计算 balance
                    const q = parseFloat(line["Quantity"] || "0") || 0;
                    const c = parseFloat(line["Cost in USD"] || "0") || 0;
                    balanceSum += q * c;

                    if (line !== line0) {
                        // 1) 拼接 "PO Line No."
                        line0["PO Line No."] = appendValue(line0["PO Line No."], line["PO Line No."]);
                        // 2) 拼接 "Quantity"
                        line0["Quantity"] = appendValue(line0["Quantity"], line["Quantity"]);
                        // 3) 拼接 "Cost in USD"
                        line0["Cost in USD"] = appendValue(line0["Cost in USD"], line["Cost in USD"]);

                        // 4) 将除以上四个字段之外的 value 设置到 line0
                        //    这些字段包括了 "ASIN", "SKU", "Description" 等
                        //    如果想要所有字段都覆盖/设置，可以在此处理
                        for (const key of Object.keys(line)) {
                            // 跳过特殊字段
                            if (["PO #", "PO Line No.", "Quantity", "Cost in USD"].includes(key)) {
                                continue;
                            }
                            // 将该字段的值设置到 line0（最后一个行覆盖）
                            line0[key] = line[key];
                        }
                    }
                });

                // 设置 Balance
                line0["Balance"] = balanceSum.toFixed(2);

                // 只保留 line0，其余行删除
                removalCount += (group.length - 1);
                finalData.push(line0);
            }
        });

        // 8) 根据 paid_Feb25.csv 设置 "paid" 字段
        finalData.forEach(line => {
            const poNum = line["PO #"] || "";
            if (paidMap.hasOwnProperty(poNum)) {
                line["paid"] = paidMap[poNum];
            } else {
                line["paid"] = 0;
            }
        });

        // -------------------------------------------------------
        // 9) 移除 success / totalRecords 字段，并新增统计字段
        // -------------------------------------------------------
        // 计算剩余字段
        const emptyWowCount = finalData.filter(line => !line["Wow_Payment_Terms"]).length;
        const conflictCount = finalData.filter(line => {
            const t1 = (line["term_name"] || "").trim();
            const t2 = (line["Wow_Payment_Terms"] || "").trim();
            return t1 && t2 && t1 !== t2; // 两个都有值且不相等才算冲突
        }).length;

        // 新的 JSON 结构
        const finalJson = {
            data: finalData,
            "Removals Dulplicate Line": removalCount,
            "POs Amounts": finalData.length,
            "Empty Wow_Payment_Terms": emptyWowCount,
            "payment term conflict": conflictCount
        };

        // 10) 写入最终文件
        fs.writeFileSync(outputFile, JSON.stringify(finalJson, null, 2), 'utf8');
        console.log(`✅ 全部处理完成，数据已保存到 ${outputFile}`);
        console.log(`   Removals Dulplicate Line: ${removalCount}`);
        console.log(`   POs Amounts: ${finalData.length}`);
        console.log(`   Empty Wow_Payment_Terms: ${emptyWowCount}`);
        console.log(`   payment term conflict: ${conflictCount}`);

    } catch (error) {
        console.error("❌ 处理失败:", error);
    }
}

// 执行处理
processFiles();
