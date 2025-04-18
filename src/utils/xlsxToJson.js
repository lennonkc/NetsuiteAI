const xlsx = require('xlsx');
const fs = require('fs').promises; // 使用 promise 版本的 fs
const path = require('path');

/**
 * 将指定的 XLSX 文件转换为 JSON 文件。
 * @param {string} inputFileName - 输入的 XLSX 文件名 (例如 'PurchaseOrderApr18.xlsx')。
 * @param {string} outputFileName - 输出的 JSON 文件名 (例如 'PurchaseOrderApr18.json')。
 * @param {string} inputDir - 输入文件所在的目录路径。
 * @param {string} outputDir - 输出文件所在的目录路径。
 */
async function convertXlsxToJson(inputFileName, outputFileName, inputDir, outputDir) {
  try {
    const inputFilePath = path.join(inputDir, inputFileName);
    const outputFilePath = path.join(outputDir, outputFileName);

    // 检查输入文件是否存在
    try {
      await fs.access(inputFilePath);
    } catch (error) {
      console.error(`错误：输入文件未找到: ${inputFilePath}`);
      return;
    }

    // 读取 Excel 文件
    const workbook = xlsx.readFile(inputFilePath);
    const sheetName = workbook.SheetNames[0]; // 假设数据在第一个工作表中
    const worksheet = workbook.Sheets[sheetName];

    // 将工作表转换为 JSON 对象数组
    const jsonData = xlsx.utils.sheet_to_json(worksheet, { 
      header: 1, 
      defval: '',
      raw: true // 保留原始值，不自动转换日期格式
    });

    // 检查是否有数据
    if (jsonData.length < 2) {
      console.warn(`警告：文件 ${inputFileName} 中没有找到有效数据行（除了标题行）。`);
      // 创建一个空的 JSON 结构
      const emptyOutput = {
        success: true,
        totalRecords: 0,
        data: []
      };
      await fs.writeFile(outputFilePath, JSON.stringify(emptyOutput, null, 2), 'utf8');
      console.log(`已成功创建空的 JSON 文件：${outputFilePath}`);
      return;
    }

    // 获取标题行
    const headers = jsonData[0];
    // 获取数据行（从第二行开始）
    const dataRows = jsonData.slice(1);
    
    // 需要带时间的日期字段列表
    const dateTimeFields = ['As Of Date', 'Date Entered'];
    
    // 仅包含日期的字段列表
    const dateOnlyFields = [
      'Estimated Ready Date / ERD', 
      'Early Pickup date', 
      'Late Pickup Date', 
      'Earliest Delivery Date', 
      'LATEST DELIVERY DATE',
      'ESTIMATED READY DATE'
    ];

    // 辅助函数：格式化日期时间为 "M/D/YYYY HH:MM" 格式
    const formatDateTime = (dateValue) => {
      if (!dateValue) return '';
      
      let date;
      // 检查是否是 Excel 的序列号日期
      if (typeof dateValue === 'number' && dateValue > 0) {
        date = xlsx.SSF.parse_date_code(dateValue);
        // 格式化为 "M/D/YYYY HH:MM"
        return `${date.m}/${date.d}/${date.y} ${date.H}:${date.M < 10 ? '0' + date.M : date.M}`;
      } 
      // 如果是字符串，检查是否已经是正确格式
      else if (typeof dateValue === 'string') {
        // 如果格式已正确，直接返回
        if (/^\d{1,2}\/\d{1,2}\/\d{4}\s\d{1,2}:\d{2}$/.test(dateValue)) {
          return dateValue;
        }
        
        // 尝试解析字符串日期
        try {
          date = new Date(dateValue);
          if (!isNaN(date.getTime())) {
            return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()} ${date.getHours()}:${date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes()}`;
          }
        } catch (e) {
          // 解析失败，返回原始值
          return dateValue;
        }
      }
      
      return dateValue.toString();
    };
    
    // 辅助函数：格式化仅日期为 "M/D/YYYY" 格式
    const formatDateOnly = (dateValue) => {
      if (!dateValue) return '';
      
      let date;
      // 检查是否是 Excel 的序列号日期
      if (typeof dateValue === 'number' && dateValue > 0) {
        date = xlsx.SSF.parse_date_code(dateValue);
        // 格式化为 "M/D/YYYY"
        return `${date.m}/${date.d}/${date.y}`;
      } 
      // 如果是字符串
      else if (typeof dateValue === 'string') {
        // 如果已经是正确格式，直接返回
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateValue)) {
          return dateValue;
        }
        
        // 尝试解析字符串日期 - 先检查是否包含时间
        if (dateValue.includes(':')) {
          // 有时间，只提取日期部分
          const parts = dateValue.split(' ');
          if (parts.length > 0) {
            return parts[0];
          }
        }
        
        // 尝试解析为日期对象
        try {
          date = new Date(dateValue);
          if (!isNaN(date.getTime())) {
            return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
          }
        } catch (e) {
          // 解析失败，返回原始值
          return dateValue;
        }
      }
      
      return dateValue.toString();
    };

    // 将数据行转换为对象数组
    const formattedData = dataRows.map(row => {
      const rowObject = {};
      headers.forEach((header, index) => {
        // 确保 header 是字符串类型，以防万一
        const headerKey = String(header).trim();
        if (headerKey) { // 忽略空的标题列
          // 获取原始值
          let value = row[index] !== undefined ? row[index] : '';
          
          // 根据字段类型应用不同的日期格式化
          if (dateTimeFields.includes(headerKey)) {
            // 需要包含时间的日期字段
            value = formatDateTime(value);
          } else if (dateOnlyFields.includes(headerKey)) {
            // 只包含日期的字段
            value = formatDateOnly(value);
          } else if (typeof value === 'number') {
            // 将所有数值转换为字符串格式
            value = String(value);
          }
          
          rowObject[headerKey] = value;
        }
      });
      return rowObject;
    });

    // 构建最终的 JSON 结构
    const outputJson = {
      success: true,
      totalRecords: formattedData.length,
      data: formattedData
    };

    // 将 JSON 数据写入文件
    // 使用 null, 2 来格式化 JSON 输出，使其更易读
    await fs.writeFile(outputFilePath, JSON.stringify(outputJson, null, 2), 'utf8');

    console.log(`文件转换成功！JSON 数据已保存至：${outputFilePath}`);

  } catch (error) {
    console.error('转换过程中发生错误:', error);
  }
}

// --- 使用示例 ---
// 定义输入和输出目录及文件名
const privateDir = path.resolve(__dirname, '../../public/xlsx/'); // 使用相对路径
const inputFile = 'PurchaseOrderApr18.xlsx';
const outputFile = 'PurchaseOrderApr18_FFFT.json';

// 调用函数执行转换
convertXlsxToJson(inputFile, outputFile, privateDir, privateDir);

// 导出该函数供其他模块使用
module.exports = { convertXlsxToJson };