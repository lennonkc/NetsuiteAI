const fs = require('fs');
const csv = require('csv-parser');

// 输入文件名
const sourceFile = "fullSources.json";  // 已经处理过的 fullSources.json
const paidFile = "paid_Feb25.csv";  // 付款记录
const outputFile = "fullSources.json"; // 覆盖原文件

// 解析 CSV 文件并返回一个 Promise
function parseCSV(filePath, keyColumn, valueColumn) {
    return new Promise((resolve, reject) => {
        const results = {};
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                const key = row[keyColumn]?.trim();
                if (key) {
                    results[key] = row[valueColumn]?.trim() || "0"; // 处理空值
                }
            })
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

// 读取 JSON 文件并处理数据
async function processFiles() {
    try {
        console.log("📂 读取 fullSources.json...");
        const sourceDataRaw = fs.readFileSync(sourceFile, 'utf8');
        let sourceData = JSON.parse(sourceDataRaw);

        if (!Array.isArray(sourceData.data)) {
            throw new Error("fullSources.json 结构无效");
        }

        console.log("📂 解析 paid_Feb25.csv...");
        const paidData = await parseCSV(paidFile, "PO", "Debit Amount");

        // 统计信息
        let removalsCount = 0;
        let emptyWowPaymentTerms = 0;
        let paymentTermConflicts = 0;

        // 处理 PO 逻辑
        const poMap = {}; // 用于存储以 PO # 为 key 的数据
        sourceData.data.forEach(item => {
            const poNumber = item["PO #"];
            const poLineNo = item["PO Line No"];
            if (!poMap[poNumber]) {
                poMap[poNumber] = { main: null, lines: [] };
            }
            if (poLineNo === "0") {
                poMap[poNumber].main = item;
            } else {
                poMap[poNumber].lines.push(item);
            }
        });

        // 处理 PO 号数据，合并信息
        const updatedData = [];
        Object.entries(poMap).forEach(([poNumber, { main, lines }]) => {
            if (!main) return; // 如果没有 "PO Line No. = 0"，跳过

            // 处理拼接字段
            const poLineNos = [];
            const quantities = [];
            const costs = [];
            let balance = 0;

            lines.forEach(line => {
                poLineNos.push(line["PO Line No"]);
                quantities.push(line["Quantity"]);
                costs.push(line["Cost in USD"]);

                // 计算 Balance
                const qty = parseFloat(line["Quantity"]) || 0;
                const cost = parseFloat(line["Cost in USD"]) || 0;
                balance += qty * cost;

                // 复制字段到主行
                Object.keys(line).forEach(key => {
                    if (!["PO Line No", "Quantity", "Cost in USD"].includes(key)) {
                        main[key] = line[key];
                    }
                });
            });

            // 更新 "PO Line No. = 0" 的行
            main["PO Line No"] = poLineNos.join(", ");
            main["Quantity"] = quantities.join(", ");
            main["Cost in USD"] = costs.join(", ");
            main["Balance"] = balance.toFixed(2);

            // 处理 paid 付款信息
            main["paid"] = paidData[poNumber] || "0";

            // 统计信息
            if (!main["Wow_Payment_Terms"]) emptyWowPaymentTerms++;
            if (main["term_name"] !== main["Wow_Payment_Terms"]) paymentTermConflicts++;

            updatedData.push(main);
            removalsCount += lines.length; // 记录删除的行数
        });

        // 构建最终 JSON 结构
        const outputJson = {
            "Removals Dulplicate Line": removalsCount,
            "POs Amounts": updatedData.length,
            "Empty Wow_Payment_Terms": emptyWowPaymentTerms,
            "payment term conflict": paymentTermConflicts,
            "data": updatedData
        };

        // 保存到 fullSources.json（覆盖）
        fs.writeFileSync(outputFile, JSON.stringify(outputJson, null, 2), 'utf8');
        console.log(`✅ 处理完成，数据已保存到 ${outputFile}`);
    } catch (error) {
        console.error("❌ 处理失败:", error);
    }
}

// 执行处理
processFiles();
