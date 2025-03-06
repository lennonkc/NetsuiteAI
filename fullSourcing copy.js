const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// 输入文件名
const sourceFile = "Record03_05_20_04.json";  // 采购订单数据
const vendorFile = "VendorID_03_05_20_53.json"; // 供应商数据
const csvFile = "WowTracking.csv"; // CSV 文件
const outputFile = "fullSources.json"; // 输出文件

// 解析 CSV 文件并返回一个 Promise
function parseCSV(filePath) {
    return new Promise((resolve, reject) => {
        const results = {};
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                const vendorID = row["Vendor Code"].trim();
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

// 读取 JSON 文件并处理数据
async function processFiles() {
    try {
        // 读取采购订单 JSON 数据
        const sourceDataRaw = fs.readFileSync(sourceFile, 'utf8');
        const sourceData = JSON.parse(sourceDataRaw);

        // 读取供应商 JSON 数据
        const vendorDataRaw = fs.readFileSync(vendorFile, 'utf8');
        const vendorData = JSON.parse(vendorDataRaw);

        if (!sourceData.success || !Array.isArray(sourceData.data)) {
            throw new Error("采购订单 JSON 结构无效");
        }

        if (!Array.isArray(vendorData.items)) {
            throw new Error("供应商 JSON 结构无效");
        }

        // 解析 CSV 数据
        console.log("📂 解析 WowTracking.csv...");
        const csvData = await parseCSV(csvFile);

        // 创建一个 entityid -> term_name 映射
        const vendorMap = {};
        vendorData.items.forEach(vendor => {
            vendorMap[vendor.entityid] = {
                term_name: vendor.term_name || "", // 如果 term_name 不存在，则设为空 ""
                terms: vendor.terms || ""
            };
        });

        console.log("✅ 已建立 Vendor ID 到 Term Name 的映射");

        // 遍历 sourceData.data，并为每个元素添加 term_name 和 WowTracking 相关字段
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
                term_name: vendorInfo.term_name,
                Wow_Payment_Terms: wowInfo["Wow Payment Terms"],
                Deposit_Required: wowInfo["Deposit Required"],
                Prepay_G: wowInfo["Prepay G"],
                Prepay_H: wowInfo["Prepay H"],
                Net_Days: wowInfo["Net Days"]
            };
        });

        // 生成新的 JSON 结构
        const outputJson = {
            success: true,
            totalRecords: updatedData.length,
            data: updatedData
        };

        // 保存到 fullSources.json
        fs.writeFileSync(outputFile, JSON.stringify(outputJson, null, 2), 'utf8');
        console.log(`✅ 处理完成，数据已保存到 ${outputFile}`);
    } catch (error) {
        console.error("❌ 处理失败:", error);
    }
}

// 执行处理
processFiles();
