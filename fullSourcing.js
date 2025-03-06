const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

/** 配置部分：文件名 **/
const sourceFile = "Record03_05_20_04.json";   // 初始采购订单数据
const vendorFile = "VendorID_03_05_20_53.json"; // SuiteQL查询到的供应商数据
const wowCsvFile = "WowTracking.csv";          // WOW Tracking CSV
const paidCsvFile = "paid_Feb25.csv";          // PO 付款情况 CSV
const outputFile = "fullSources.json";         // 最终输出文件

//--------------------------------------------------------------------
// 1) 解析 WowTracking.csv
//--------------------------------------------------------------------
function parseWowTrackingCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = {};
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        // 这里取 "Vendor Code" 作为 VendorID
        const vendorID = (row["Vendor Code"] || "").trim();
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

//--------------------------------------------------------------------
// 2) 解析 paid_Feb25.csv
//--------------------------------------------------------------------
function parsePaidCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = {};
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        // row.PO, row["Debit Amount"]
        const poNumber = (row["PO"] || "").trim();
        const debitAmount = parseFloat(row["Debit Amount"] || "0");
        results[poNumber] = isNaN(debitAmount) ? 0 : debitAmount;
      })
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

//--------------------------------------------------------------------
// 常用日期/百分比处理函数
//--------------------------------------------------------------------
function parseDateMDY(str) {
  // 假设 str 类似 "3/4/2025" 或 "3/4/2025 7:58 am"
  // 仅取前半部分以空格 split
  if (!str) return null;
  const datePart = str.split(" ")[0]; // "3/4/2025"
  const [m, d, y] = datePart.split("/");
  if (!m || !d || !y) return null;
  // 注意：月份从 0 开始
  return new Date(Number(y), Number(m) - 1, Number(d));
}

function formatDateMDY(date) {
  if (!date) return "";
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

// 给日期加天数
function addDays(date, days) {
  if (!date) return null;
  const newDate = new Date(date.getTime());
  newDate.setDate(newDate.getDate() + days);
  return newDate;
}

// 把类似 "50%" 转成 0.5，如果是空或无法解析，返回 0
function parsePct(pctStr) {
  if (!pctStr) return 0;
  const val = parseFloat(pctStr.replace("%", "").trim());
  if (isNaN(val)) return 0;
  return val / 100;
}

// 返回 "Past Due" 或当前月份简称（如 "Mar"）
function getAnchor(date) {
  if (!date) return "";
  const now = new Date();
  // 若 date < 当前时间，则 Past Due，否则返回当前月份
  return date < now ? "Past Due" : monthNames[now.getMonth()];
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", 
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

//--------------------------------------------------------------------
// 主处理流程
//--------------------------------------------------------------------
async function processFiles() {
  try {
    // ============ 1) 读取采购订单 JSON 数据 ============
    const sourceDataRaw = fs.readFileSync(sourceFile, 'utf8');
    const sourceData = JSON.parse(sourceDataRaw);

    // ============ 2) 读取供应商 JSON 数据 ============
    const vendorDataRaw = fs.readFileSync(vendorFile, 'utf8');
    const vendorData = JSON.parse(vendorDataRaw);

    if (!sourceData.success || !Array.isArray(sourceData.data)) {
      throw new Error("采购订单 JSON 结构无效");
    }
    if (!Array.isArray(vendorData.items)) {
      throw new Error("供应商 JSON 结构无效");
    }

    // ============ 3) 解析 WowTracking.csv (支付条款) ============
    console.log("📂 解析 WowTracking.csv...");
    const wowData = await parseWowTrackingCSV(wowCsvFile);

    // ============ 4) 建立 entityid -> term_name / terms 映射 ============
    const vendorMap = {};
    vendorData.items.forEach(vendor => {
      vendorMap[vendor.entityid] = {
        term_name: vendor.term_name || "",
        terms: vendor.terms || ""
      };
    });
    console.log("✅ 已建立 Vendor ID -> term_name 的映射");

    // ============ 5) 合并来源：Record03_05_20_04.json + vendorMap + wowData ============
    const updatedData = sourceData.data.map(item => {
      const vendorID = item.ID; // Record 中的 ID
      const vendorInfo = vendorMap[vendorID] || { term_name: "", terms: "" };
      const wowInfo = wowData[vendorID] || {
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

    // ============ 6) 解析 paid_Feb25.csv ============ 
    console.log("📂 解析 paid_Feb25.csv...");
    const paidMap = await parsePaidCSV(paidCsvFile);

    // ============ 7) 合并相同 PO 的多行 (line0 逻辑) ============
    // 按 PO # 分组
    const poGroups = {};
    updatedData.forEach(line => {
      const poNum = line["PO #"] || "";
      if (!poGroups[poNum]) {
        poGroups[poNum] = [];
      }
      poGroups[poNum].push(line);
    });

    let removalCount = 0;
    const finalData = [];

    // 小工具：拼接字符串
    function appendValue(base, addition) {
      if (!base) return addition || "";
      if (!addition) return base;
      return base + "," + addition;
    }

    // 合并
    Object.keys(poGroups).forEach(poNum => {
      const group = poGroups[poNum];
      // 查找有没有 line0
      const line0 = group.find(g => g["PO Line No."] === "0");

      if (!line0) {
        // 如果没有 line0，则原样保留
        finalData.push(...group);
      } else {
        let balanceSum = 0;
        group.forEach(line => {
          const q = parseFloat(line["Quantity"] || "0") || 0;
          const c = parseFloat(line["Cost in USD"] || "0") || 0;
          balanceSum += q * c;

          if (line !== line0) {
            // 拼接字段
            line0["PO Line No."] = appendValue(line0["PO Line No."], line["PO Line No."]);
            line0["Quantity"] = appendValue(line0["Quantity"], line["Quantity"]);
            line0["Cost in USD"] = appendValue(line0["Cost in USD"], line["Cost in USD"]);
            // 覆盖/设置其他字段
            for (const key of Object.keys(line)) {
              if (["PO #", "PO Line No.", "Quantity", "Cost in USD"].includes(key)) {
                continue;
              }
              // line0 使用最后一行的信息
              line0[key] = line[key];
            }
          }
        });

        line0["Balance"] = balanceSum.toFixed(2);
        removalCount += (group.length - 1);
        finalData.push(line0);
      }
    });

    // ============ 8) 设置 paid 字段 ============
    finalData.forEach(line => {
      const poNum = line["PO #"] || "";
      if (paidMap.hasOwnProperty(poNum)) {
        line["paid"] = paidMap[poNum];
      } else {
        line["paid"] = 0;
      }
    });

    // ============ 9) 统计与移除 success / totalRecords ============
    // 先计算统计值
    const emptyWowCount = finalData.filter(line => !line["Wow_Payment_Terms"]).length;
    const conflictCount = finalData.filter(line => {
      const t1 = (line["term_name"] || "").trim();
      const t2 = (line["Wow_Payment_Terms"] || "").trim();
      return t1 && t2 && t1 !== t2; // 两者都有值且不相等
    }).length;

    // ============ 10) 再次遍历，为每个元素添加“Deposit”、“Prepay”、“Unpaid”等信息 ============

    // 帮助函数：根据 "Date Entered" 计算 Deposit Date, 根据 "ERD" + "Net_Days" 计算 Unpaid Date
    // Anchor 判断：若 date < now => "Past Due"，否则返回当前月份简称
    const now = new Date();

    finalData.forEach(line => {
      // 解析数字
      const balanceVal = parseFloat(line["Balance"] || "0") || 0;
      const paidVal = parseFloat(line["paid"] || "0") || 0;

      // 1) Unpaid = Balance - paid
      const unpaidVal = balanceVal - paidVal; // 可能为负则表示超付，但此处按题意直接保留
      // 将 “Unpaid” 做成一个对象，包含多个子字段
      // 为避免冲突，这里直接将所有相关字段放在同一个 "Unpaid" 对象里
      // 若你想和题意完全一致（即 "Unpaid" 同时是数字、又是对象），那将冲突，故此以对象方案示例
      // 如果你确实想要同名字段，可改名 "UnpaidObj" 等。
      line["Unpaid"] = {
        value: +unpaidVal.toFixed(2) // 保留两位
      };

      // 2) Deposit
      const depositFrac = parsePct(line["Deposit_Required"]); // 0~1
      // parse "Date Entered"
      const dateEntered = parseDateMDY(line["Date Entered"] || "");
      const depositDate = addDays(dateEntered, 14);
      const depositDateStr = formatDateMDY(depositDate);
      const depositAnchor = getAnchor(depositDate);

      let depositDue = 0;
      if (paidVal <= 0) {
        depositDue = depositFrac * balanceVal;
      }
      // 生成 Deposit 对象
      line["Deposit"] = {
        "Deposit Date": depositDateStr,
        "Deposit % Due": line["Deposit_Required"] || "0%", // 原样放回
        "Deposit anchor": depositAnchor,
        "Deposit $ Due": +depositDue.toFixed(2)
      };

      // 3) Prepay
      const prepayFrac = parsePct(line["Prepay_H"]); // 0~1
      // parse "Estimated Ready Date / ERD"
      const erd = parseDateMDY(line["Estimated Ready Date / ERD"] || "");
      const prepayDateStr = formatDateMDY(erd);
      const prepayAnchor = getAnchor(erd);

      let prepayDue = 0;
      if (paidVal > 0) {
        // 题意：若 paid <= 0 => 0，否则 prepayFrac × Unpaid
        prepayDue = prepayFrac * unpaidVal;
        if (prepayDue < 0) prepayDue = 0; // 若 unpaidVal < 0，则保持 0
      }
      line["Prepay"] = {
        "Prepay Date": prepayDateStr,
        "Prepay % Due": line["Prepay_H"] || "0%",
        "Prepay anchor": prepayAnchor,
        "Prepay $ Due": +prepayDue.toFixed(2)
      };

      // 4) Unpaid (对象部分)
      // = 1 - depositFrac - prepayFrac
      let remainderFrac = 1 - depositFrac - prepayFrac;
      if (remainderFrac < 0) remainderFrac = 0;
      const unpaidPctStr = `${(remainderFrac * 100).toFixed(0)}%`; // 转回百分比整数

      // "Unpaid Date" = ERD + Net_Days
      const netDays = parseInt(line["Net_Days"] || "0", 10);
      const unpaidDate = addDays(erd, netDays);
      const unpaidDateStr = formatDateMDY(unpaidDate);
      const unpaidAnchor = getAnchor(unpaidDate);

      let unpaidDue = 0;
      if (paidVal > 0) {
        const portion = remainderFrac * balanceVal; 
        // 若 portion 大于当前未付 unpaidVal，就取未付金额
        unpaidDue = Math.min(portion, unpaidVal);
        if (unpaidDue < 0) unpaidDue = 0; // 防止负数
      }

      // 直接在之前的 line["Unpaid"] 里继续添加
      line["Unpaid"]["Unpaid Date"] = unpaidDateStr;
      line["Unpaid"]["Unpaid % Due"] = unpaidPctStr;
      line["Unpaid"]["Unpaid anchor"] = unpaidAnchor;
      line["Unpaid"]["Unpaid $ Due"] = +unpaidDue.toFixed(2);
    });

    // ============ 最终统计并输出 ============
    const finalJson = {
      data: finalData,
      "Removals Dulplicate Line": removalCount,
      "POs Amounts": finalData.length,
      "Empty Wow_Payment_Terms": emptyWowCount,
      "payment term conflict": conflictCount
    };

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

//--------------------------------------------------------------------
// 执行
//--------------------------------------------------------------------
processFiles();
