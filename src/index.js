// src/services/main.js

// const { fetchRecordData } = require('./services/SourcePO');
// (async () => {
//   try {
//     // // 第一步：获取并保存 Record JSON，拿到文件路径
//     // console.log("▶ 1) Fetching Record Data...");
//     const recordFilePath = "private/2025May/PurchaseOrderMay14.json";
//     // // 假设返回结果类似: 

//     // 第二步：基于 Record JSON 查询供应商信息并保存 Vendor JSON
//     console.log("▶ 2) Fetching Vendor Data...");
//     const vendorFilePath = await fetchVendorData(recordFilePath);
//     // 假设返回结果类似: "/Users/xxx/private/VendorID_Mar_12.json"

//     // 第三步：进行 fullSourcing 流程（合并 CSV、Vendor、PO数据）
//     // 这里 wowCsvFile、paidCsvFile 是你固定要处理的 CSV 文件
//     // console.log("▶ 3) Processing Full Sourcing...");
//     // const ptDefineCsvFile = "private/PaymentTerm_define.csv";// 测试PT_Define文件
//     // const paidCsvFile = "private/paid_Feb25.csv";
//     // const finalFilePath = await processFullSourcing(recordFilePath, vendorFilePath, ptDefineCsvFile, paidCsvFile);

//     // console.log("✅ 所有操作完成！");
//     // console.log("   Record 文件路径:", recordFilePath);
//     console.log("   Vendor 文件路径:", vendorFilePath);
//     // console.log("   Final 文件路径:", finalFilePath);

//   } catch (err) {
//     console.error('❌ 执行流程出错:', err);
//   }
// })();




// 生成最终文件
const { processFullSourcing } = require('./services/fullSourcing');

(async () => {
  try {
    // 基于 Mar_18 的PO 数据和Mar24 的 Paid 数据 生成 final_Mar_24
    const recordFilePath = "private/2025May/PurchaseOrderMay14.json";
    const vendorFilePath = "private/VendorID_May_14.json"
    const ptDefineCsvFile = "private/PaymentTerm_define.csv";
    const paidCsvFile = "private/2025May/paidPOMay9.csv";
    const finalFilePath = await processFullSourcing(recordFilePath, vendorFilePath, ptDefineCsvFile, paidCsvFile);

    console.log("✅ 所有操作完成！");
    console.log("   Record 文件路径:", recordFilePath);
    console.log("   Vendor 文件路径:", vendorFilePath);
    console.log("   Final 文件路径:", finalFilePath);

  } catch (err) {
    console.error('❌ 执行流程出错:', err);
  }
})();


// // 更新vendorID文件
// const { fetchVendorData } = require('./services/vendorID');

// (async () => {
//   try {
//     const recordFilePath = "private/2025May/PurchaseOrderMay14.json";

//     console.log("▶ 2) Fetching Vendor Data...");
//     const vendorFilePath = await fetchVendorData(recordFilePath);

//     console.log("   Vendor 文件路径:", vendorFilePath);

//   } catch (err) {
//     console.error('❌ 执行流程出错:', err);
//   }
// })();