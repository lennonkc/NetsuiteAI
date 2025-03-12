// main.js
const { fetchRecordData } = require('./SourcePO');
const { fetchVendorData } = require('./vendorID');

(async () => {
  try {
    // 第一步：获取并保存 Record JSON，拿到文件路径
    const recordFilePath = await fetchRecordData();

    // 第二步：基于 Record JSON 查询供应商信息并保存 Vendor JSON
    const vendorFilePath = await fetchVendorData(recordFilePath);

    console.log('✅ 所有操作完成！');
    console.log('Record 文件路径:', recordFilePath);
    console.log('Vendor 文件路径:', vendorFilePath);
  } catch (err) {
    console.error('❌ 执行流程出错:', err);
  }
})();
