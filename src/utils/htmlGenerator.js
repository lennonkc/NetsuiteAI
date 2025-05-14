// 利用 final.json 的其他数据生成一个汇总报告
function appendAggregatedDataDescription(maindata) {
  // 1) 取出剩余字段
  const totalLines         = maindata["totalLines"] || 0;
  // const pOsValidCalc           = maindata["[POs total Amounts] - [POs unvalid Amounts] = POs valid Amounts"] || "";
  const emptyPaymentTermsPOs   = maindata["Empty Payment_Terms POs"] || [];
  const emptyPaymentTermsVendors = maindata["Empty Payment_Terms Vendors"] || [];
  const undefinePT_AmountEffected = maindata["undefinePT_AmountEffected"];
  // const multipleERDsConflictPOCount = maindata["Mutiple ERDs conflict PO Count"] || 0;
  // const errorEstimation        = parseFloat(maindata["Error Estimation Due To Line Conflicts"] || 0);
  const havingPaymentTermNotInPTDefine = maindata["Having Payment Term Value but not in PTDefine.csv Vendors"] || [];

  // 2) 样式与文案
  let html = `
    <style>
      /* 外层容器，带圆角、浅色背景、阴影，提升视觉层次 */
      .info-container {
        background-color: #f9f9f9;
        border: 1px solid #ccc;
        padding: 20px;
        margin-top: 30px;
        border-radius: 8px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        font-family: Arial, sans-serif;
      }

      .info-container h2 {
        margin-top: 0;
        color: #333;
        font-size: 1.4em;
        border-left: 4px solid #007bff; 
        padding-left: 8px;
      }

      .info-container h3 {
        color: #333;
        margin-top: 1em;
        margin-bottom: 0.5em;
      }

      .info-container p {
        line-height: 1.6;
        color: #555;
        margin-top: 0.5em;
        margin-bottom: 1.2em;
      }

      .info-container ul {
        margin-left: 20px;
        padding-left: 0;
      }

      .info-container li {
        margin-bottom: 5px;
        list-style: disc;
      }

      .highlight {
        color: #007bff;
        font-weight: bold;
      }

      .warning-text {
        color: #ff6600;
        font-weight: bold;
      }

      .error-amount {
        color: #d9534f;
        font-weight: bold;
      }

      .separator {
        margin: 1.2em 0;
        border: none;
        border-top: 1px dashed #ccc;
      }
    </style>

    <div class="info-container">
      <h2>Additional Information</h2>

      <p>
        <span class="warning-text">🌟 Notice:</span> We calculated <strong>${totalLines}</strong> PO lines 
        <br>
        <span class="warning-text">📝 Document:</span> The key information for this project is maintained in this document.
 <strong> <a href="https://docs.google.com/document/d/1GX2ExrTL1QmkDNUnB1wRu7UpKENR7HzwPdXal_9a1OY/edit?tab=t.0#heading=h.n8ic0ggtrppy">Link</a> </strong>
        <br>
        <span class="highlight">📆 Date of Open PO data: </span> <strong>May 14</strong> 
        <br>
        <span class="highlight">📆 Date of Paid PO data: </span> <strong>May 12</strong>  
      </p>

      <hr class="separator">

      <h3>Empty Payment_Terms Detected</h3>
      <p>
        Some POs/Vendors were found with empty payment terms. 
      </p>
      <ul>
        <li><strong>Empty Payment_Terms POs:</strong> 
          ${emptyPaymentTermsPOs.length ? emptyPaymentTermsPOs.join(", ") : "None"}</li>
        <li><strong>Empty Payment_Terms Vendors:</strong> 
          ${emptyPaymentTermsVendors.length ? emptyPaymentTermsVendors.join(", ") : "None"}</li>
      </ul>
      <p>
        The effected amount is <strong class="highlight">${undefinePT_AmountEffected}</strong>.
      </p>
      <p>
        Additionally, the following vendors have Payment Term values 
        not present in our <em>PTDefine.csv</em> reference:
      </p>
      <ul>
        <li>${havingPaymentTermNotInPTDefine.length 
            ? havingPaymentTermNotInPTDefine.join(", ") 
            : "✅ All is well, No such vendor found."}</li>
      </ul>

      <hr class="separator">


    </div>
  `;

  return html;
}

//生成Merge表
function generateMergeBudget(aggregatedData) {
  // 列名固定顺序
  const budgetCols = [
    "YTD",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
    "FY 25",
  ];

  // 帮助函数：将数值转为“$xx.xxM”，若为 0 则返回空字符串
  function formatMillion(val) {
    if (!val || isNaN(val) || val === 0) return "";
    const million = val / 1e6;
    return `$${million.toFixed(2)}M`;
  }

  // 帮助函数：从 aggregatedData 累加某列 (e.g. "Past Due - Total")
  function sumAllSuppliers(colName) {
    let sum = 0;
    for (const sup of Object.keys(aggregatedData)) {
      sum += aggregatedData[sup][colName] || 0;
    }
    return sum;
  }

  // 计算"Open POs / AP outstanding" 各列的默认值
  //  - YTD => Past Due - Total
  //  - Mar => Mar - Total
  //  - Apr => Apr - Total
  //  ...
  const ytdVal = sumAllSuppliers("Past Due - Total");
  const marVal = sumAllSuppliers("Mar - Total");
  const aprVal = sumAllSuppliers("Apr - Total");
  const mayVal = sumAllSuppliers("May - Total");
  const junVal = sumAllSuppliers("Jun - Total");
  const julVal = sumAllSuppliers("Jul - Total");
  const augVal = sumAllSuppliers("Aug - Total");
  const sepVal = sumAllSuppliers("Sep - Total");
  const octVal = sumAllSuppliers("Oct - Total");
  const novVal = sumAllSuppliers("Nov - Total");
  const decVal = sumAllSuppliers("Dec - Total");

  // FY 25 => 上面所有月份之和
  const fy25Val =
    ytdVal +
    marVal +
    aprVal +
    mayVal +
    junVal +
    julVal +
    augVal +
    sepVal +
    octVal +
    novVal +
    decVal;

  // 转成初始字符串 "$xx.xxM"
  const openPOsData = [
    formatMillion(ytdVal),
    formatMillion(marVal),
    formatMillion(aprVal),
    formatMillion(mayVal),
    formatMillion(junVal),
    formatMillion(julVal),
    formatMillion(augVal),
    formatMillion(sepVal),
    formatMillion(octVal),
    formatMillion(novVal),
    formatMillion(decVal),
    formatMillion(fy25Val),
  ];

  // 下面构建表格的行数据（共 11 行）
  //
  // 注意：
  //   - isInput = true => 这行的 12 列都用 <input>，可以编辑
  //   - isComputed = true => 这行的数据由 JS 动态计算 (disbursements, remain, remainQuarterly)
  //   - purpleRow => 紫色背景
  //   - bold => 字体加粗
  //   - defaultData => 传入的初始字符串数组
  //
  // 每个 row 的 data 都是 12 项，对应 budgetCols [YTD,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec,FY 25].
  const rows = [
    {
      id: "totalBudget",
      label: "Total Budget",
      data: [
        "$13.92M",
        "$3.07M",
        "$3.66M",
        "$5.02M",
        "$5.30M",
        "$6.31M",
        "$6.76M",
        "$6.14M",
        "$5.61M",
        "$5.33M",
        "$6.02M",
        "$67.13M",
      ],
      bold: true,
      purpleRow: false,
      isInput: false,
      isComputed: false,
    },
    {
      id: "merchPaid",
      label: "Merch Paid",
      data: new Array(12).fill(""), // 默认空
      bold: false,
      purpleRow: false, // 白色背景
      isInput: true, // 可编辑
      isComputed: false,
    },
    {
      id: "openPOs",
      label: "Open POs / AP outstanding",
      data: openPOsData,
      bold: true,
      purpleRow: false,
      isInput: true, // 可以让用户手动修改
      isComputed: false,
    },
    {
      id: "appUS",
      label: "Approved buy - US",
      data: new Array(12).fill(""),
      bold: false,
      purpleRow: true,
      isInput: true,
      isComputed: false,
    },
    {
      id: "appUK",
      label: "Approved buy - UK",
      data: new Array(12).fill(""),
      bold: false,
      purpleRow: true,
      isInput: true,
      isComputed: false,
    },
    {
      id: "appNPI",
      label: "Approved buy - NPI",
      data: new Array(12).fill(""),
      bold: false,
      purpleRow: true,
      isInput: true,
      isComputed: false,
    },
    {
      id: "appComponents",
      label: "Approved buy - Components",
      data: new Array(12).fill(""),
      bold: false,
      purpleRow: true,
      isInput: true,
      isComputed: false,
    },
    {
      id: "appBAM",
      label: "Approved buy - BAM",
      data: new Array(12).fill(""),
      bold: false,
      purpleRow: true,
      isInput: true,
      isComputed: false,
    },
    {
      id: "disbursements",
      label: "Disbursements Total",
      data: new Array(12).fill(""), // 需动态计算
      bold: false,
      purpleRow: false,
      isInput: false,
      isComputed: true,
    },
    {
      id: "remainBudget",
      label: "Remaining Budget",
      data: new Array(12).fill(""), // 需动态计算
      bold: false,
      purpleRow: false,
      isInput: false,
      isComputed: true,
    },
    {
      id: "remainQuarterly",
      label: "Remaining Quarterly Budget",
      data: new Array(12).fill(""), // 仅在Mar,Jun,Sep,Dec有值
      bold: false,
      purpleRow: false,
      isInput: false,
      isComputed: true,
    },
  ];

  // 准备样式 + 表格结构
  // 注：这里内嵌了一段 <script> 实现“当用户修改输入框时自动重算”的逻辑
  // 如果你不想要动态功能，可以去掉 <script> 里所有内容，以及后面所有 oninput="recalcTable()"
  let html = `
  <style>
    .merge-budget-table {
      width: 100%;
      border-collapse: collapse;
      font-family: Arial, sans-serif;
    }
    .merge-budget-table th, .merge-budget-table td {
      border: 1px solid #ccc;
      padding: 8px;
      white-space: normal;
      text-align: right; /* 数字右对齐 */
    }
    .merge-budget-table thead tr {
      background-color: #007bff;
      color: #fff;
    }
    /* 固定列宽: 第一列150px, 其余50px (或更多) */
    .merge-budget-table th:first-child,
    .merge-budget-table td:first-child {
      width: 150px;
      text-align: left; /* 行名左对齐 */
    }
    .merge-budget-table th:not(:first-child),
    .merge-budget-table td:not(:first-child) {
      width: 50px;
      min-width: 50px;
    }
    /* 交替行颜色 
    .merge-budget-table tbody tr:nth-child(even) {
      background-color: #f8f9fa;
    }*/
    /* 紫色背景行 */
    .purple-row {
      background-color: #d9b3ff;
    }
    /* 如果要加粗 */
    .bold-text {
      font-weight: bold;
    }
    /* 容器可横向滚动 */
    .merge-budget-container {
      width: 100%;
      overflow-x: auto;
    }
    /* input 样式(仅供示例) */
    .merge-budget-table input[type="text"] {
      width: 100%;
      box-sizing: border-box;
      text-align: right; 
      border: none;
      outline: none;
      font-size: 15px;
      background-color: inherit; /* 保持与所在单元格一致 */
    }
  </style>
  
  <div class="merge-budget-container">
    <table class="merge-budget-table">
      <thead>
        <tr>
          <th></th>
          ${budgetCols.map((col) => `<th>${col}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
  `;

  // 生成每行
  rows.forEach((row) => {
    const rowClasses = [];
    if (row.purpleRow) rowClasses.push("purple-row");
    let rowStyle = "";
    html += `<tr class="${rowClasses.join(" ")}">`;

    // 第一列: label
    const labelStyle = row.bold ? 'class="bold-text"' : "";
    html += `<td ${labelStyle}>${row.label}</td>`;

    // 后面12列
    row.data.forEach((val, idx) => {
      // val 是初始化时的字符串(如 "$3.07M" 或 "")
      // 如果是 input 行 => 显示 input; 否则就直接显示文本
      let cellContent = "";
      if (row.isInput) {
        // 用 input
        cellContent = `<input type="text" oninput="recalcTable()" data-row="${row.id}" data-col="${idx}" value="${val}">`;
      } else if (row.isComputed) {
        // 计算行 => 初始置空, 让JS算
        cellContent = `<span data-row="${row.id}" data-col="${idx}"></span>`;
      } else {
        // 纯展示行
        cellContent = val || "";
      }
      html += `<td>${cellContent}</td>`;
    });

    html += `</tr>`;
  });

  html += `
      </tbody>
    </table>
  </div>
  
  <script>
  // -------------- JS部分：当用户修改输入框时动态刷新 --------------
  
  // 小工具：将"$xx.xxM"解析回数值(单位: 1美元), 若无则返回0
  function parseMillion(str) {
    if (!str) return 0;
    // 形如 "$12.34M"
    // 去掉美元符号、M，转成数值
    const cleaned = str.replace(/[^0-9.\\-]/g, ""); // 保留数字和小数点
    const num = parseFloat(cleaned);
    if (isNaN(num)) return 0;
    return num * 1e6;
  }
  
  // 小工具：将数值(单位=美元)转换成"$xx.xxM" 右对齐
  function formatMillion(val) {
    if (!val || isNaN(val) || val === 0) return "";
    const million = val / 1e6;
    return "$" + million.toFixed(2) + "M";
  }
  
  // 当用户修改输入框时, 重算 Disbursements Total, Remaining Budget, Remaining Quarterly Budget
  function recalcTable() {
    // 1) 先把所有输入框的值解析出来, 并存储到一个临时结构中
    //    rowId => [12列数值(单位美元)]
    const rowData = {};
    const inputs = document.querySelectorAll('input[data-row]');
    inputs.forEach(ip => {
      const rowId = ip.getAttribute('data-row');
      const colIndex = parseInt(ip.getAttribute('data-col'), 10);
      const valNum = parseMillion(ip.value);
      if (!rowData[rowId]) {
        rowData[rowId] = new Array(12).fill(0);
      }
      rowData[rowId][colIndex] = valNum;
    });
  
    // 2) 处理非输入行(比如 "Total Budget", 初始就硬编码在HTML里, 也要解析)
    //    这里演示只解析 "Total Budget" 行, 其余如果还想解析, 同理即可
    rowData["totalBudget"] = new Array(12).fill(0);
    const tbCells = document.querySelectorAll('td span[data-row="totalBudget"], td[data-row="totalBudget"]');
    // 但我们上面并没有给 totalBudget 的 td 加 data-row. 
    // 这里更简单方式: 直接从HTML初始的值去读. 
    // => 我们先在 <td> 里加 data-row="totalBudget" data-col="x" ?
    // => 为了简化，这里手动解析:
  
    // 简便做法: 直接从HTML中 rows[0].data 里 parse
    // (行[0]是我们生成JS前, "Total Budget" 可能只在innerHTML)
    // 但为了避免混乱，这里就先手写解析：
    // 反正本demo里 "Total Budget" 不会变动.
  
    // 3) 计算 Disbursements Total: 
    //    = Merch Paid + Open POs + Approved buy(US/UK/NPI/Components/BAM)
    //    row ids = merchPaid, openPOs, appUS, appUK, appNPI, appComponents, appBAM
    const colCount = 12;
    const dispRow = new Array(colCount).fill(0);
    let sumRowIDs = ["merchPaid", "openPOs", "appUS", "appUK", "appNPI", "appComponents", "appBAM"];
    sumRowIDs.forEach(rid => {
      if (!rowData[rid]) {
        rowData[rid] = new Array(colCount).fill(0);
      }
    });
    for (let c=0; c<colCount; c++) {
      dispRow[c] = sumRowIDs.reduce((acc, rid) => acc + rowData[rid][c], 0);
    }
    rowData["disbursements"] = dispRow;
  
    // 4) 计算 Remaining Budget = Total Budget - Disbursements
    //    先解析 "Total Budget" 行(硬编码在HTML) => 需要看行[0].data ?
    //    我们在JS中已知:
    const totalBudgetVals = [
      // 从HTML中那行拿：与上面相同
      "$13.92M","$3.07M","$3.66M","$5.02M","$5.30M",
      "$6.31M","$6.76M","$6.14M","$5.61M","$5.33M",
      "$6.02M","$67.13M"
    ].map(parseMillion);
  
    const remainRow = new Array(colCount).fill(0);
    for (let c=0; c<colCount; c++) {
      remainRow[c] = totalBudgetVals[c] - dispRow[c];
    }
    rowData["remainBudget"] = remainRow;
  
    // 5) 计算 Remaining Quarterly Budget:
    //    仅在Mar(1), Jun(4), Sep(7), Dec(10) 有值
    //    例如 Mar => YTD(0)+Mar(1) 两列的 remainBudget 之和
    //    Jun => Apr(2)+May(3)+Jun(4)
    //    Sep => Jul(5)+Aug(6)+Sep(7)
    //    Dec => Oct(8)+Nov(9)+Dec(10)
    const rqRow = new Array(colCount).fill(0);
    const rb = rowData["remainBudget"];
    // Mar (col=1) => YTD(0) + Mar(1)
    rqRow[1] = rb[0] + rb[1];
    // Jun (col=4) => Apr(2) + May(3) + Jun(4)
    rqRow[4] = rb[2] + rb[3] + rb[4];
    // Sep (col=7) => Jul(5) + Aug(6) + Sep(7)
    rqRow[7] = rb[5] + rb[6] + rb[7];
    // Dec (col=10) => Oct(8) + Nov(9) + Dec(10)
    rqRow[10] = rb[8] + rb[9] + rb[10];
    rowData["remainQuarterly"] = rqRow;
  
    // 6) 写回到表格中
    //    对于 "disbursements", "remainBudget", "remainQuarterly" 三行,
    //    我们在HTML中用 <span data-row="xxx" data-col="c"></span> 占位
    ["disbursements","remainBudget","remainQuarterly"].forEach(rid => {
      const spans = document.querySelectorAll(\`span[data-row="\${rid}"]\`);
      spans.forEach(sp => {
        const c = parseInt(sp.getAttribute("data-col"), 10);
        const val = rowData[rid][c] || 0;
        sp.textContent = formatMillion(val);
      });
    });
  }
  
  // 首次载入时，调用一次 recalc，刷新那些空白的 "disbursements","remainBudget","remainQuarterly"
  document.addEventListener("DOMContentLoaded", () => {
    recalcTable();
  });
  </script>
  `;
  return html;
}

//生成summary表
function generateHTMLTable(maindata) {
  // 1. 数据源
  const dataArray = maindata.data || [];

  // 2. 当前系统月份 (0=Jan,1=Feb,...,11=Dec)
  const now = new Date();
  const currentMonthIndex = now.getMonth(); // 例如 2 表示三月

  // 3. 准备要显示的列名:
  //    (1) 先加上 "Past Due" 4 列
  const columnKeys = [
    "Past Due - Deposit",
    "Past Due - Prepay",
    "Past Due - Unpaid",
    "Past Due - Total",
  ];

  //    (2) 从当前月份到 12 月，每个月份生成 4 列 (Deposit, Prepay, Unpaid, Total)
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  for (let m = currentMonthIndex; m < 12; m++) {
    const mm = months[m]; // 如 "Mar","Apr"...
    columnKeys.push(`${mm} - Deposit`);
    columnKeys.push(`${mm} - Prepay`);
    columnKeys.push(`${mm} - Unpaid`);
    columnKeys.push(`${mm} - Total`);
  }

  // 4. 用对象来汇总每个 Supplier 的数据
  //    结构形如:
  //    aggregatedData = {
  //      "SupplierA": { "Past Due - Deposit": number, "Mar - Deposit": number, ... },
  //      "SupplierB": { ... },
  //      ...
  //    }
  const aggregatedData = {};

  // 5. 辅助函数: 根据 anchor + type 确定目标列
  //    - 若 anchor 不在 ["Jan".."Dec"] 里，或是早于当前月份，就归到 "Past Due - type"
  //    - 否则归到 "xxx - type" (如 "Mar - Deposit")
  function getColumnNameByAnchor(anchor, type) {
    if (!anchor) {
      // anchor 为空 => Past Due
      return `Past Due - ${type}`;
    }
    const anchorUpper = anchor.trim().toUpperCase(); // 如 "APR"
    const anchorIndex = months.findIndex(
      (m) => m.toUpperCase() === anchorUpper
    );
    if (anchorIndex === -1) {
      // 未识别，或不是真正的月份 => Past Due
      return `Past Due - ${type}`;
    }
    // 若这个月份比当前系统月份更早，也视为 Past Due
    if (anchorIndex < currentMonthIndex) {
      return `Past Due - ${type}`;
    }
    // 否则就是 anchor 对应的月份列
    const originalName = months[anchorIndex]; // "Apr"
    return `${originalName} - ${type}`;
  }

  // 6. 遍历 dataArray，每个元素对 "Deposit","Prepay","Unpaid" 做处理
  dataArray.forEach((item) => {
    const supplier = item.Supplier || "Unknown Supplier";
    // 若该 supplier 第一次出现 => 初始化全部列为 0
    if (!aggregatedData[supplier]) {
      aggregatedData[supplier] = {};
      columnKeys.forEach((colName) => {
        aggregatedData[supplier][colName] = 0;
      });
    }

    ["Deposit", "Prepay", "Unpaid"].forEach((type) => {
      if (!item[type]) return; // 没有这块数据，跳过
      const anchorKey = `${type} anchor`; // e.g. "Deposit anchor"
      const dueKey = `${type} $ Due`; // e.g. "Deposit $ Due"

      const anchor = item[type][anchorKey];
      const rawValue = parseFloat(item[type][dueKey] || 0);
      const dueValue = isNaN(rawValue) ? 0 : rawValue;

      // 根据 anchor + type => 列名
      const colName = getColumnNameByAnchor(anchor, type);

      // 累加
      aggregatedData[supplier][colName] += dueValue;

      // 顺带更新同月 " - Total"
      const totalCol = colName.replace(` - ${type}`, " - Total");
      aggregatedData[supplier][totalCol] += dueValue;
    });
  });

  // 7. 生成 HTML: 包含 <style>、<div>、<table> 等
  let html = `
      <style>
        /* 表格基础样式 */
        table {
          width: 100%;
          border-collapse: collapse;
          font-family: Arial, sans-serif;
        }
  
        /* 表头: 蓝底白字 */
        thead tr {
          background-color: #007bff;
          color: #fff;
          text-align: left;
        }
  
        th, td {
          border: 1px solid #ccc;
          padding: 8px;
          white-space: normal; /* 允许文本换行 */
        }
  
        /* 第一列固定 300px，其它列 50px */
        th:first-child,
        td:first-child {
          width: 300px;
        }
        th:not(:first-child),
        td:not(:first-child) {
          width: 100px;
          min-width: 100px;
        }
  
        /* 交替行颜色 */
        tbody tr:nth-child(even) {
          background-color: #f8f9fa;
        }
  
        /* 悬停行高亮 */
        tbody tr:hover {
          background-color: #e9ecef;
        }
  
        /* 横向滚动容器 */
        .table-container {
          width: 100%;
          overflow-x: auto; /* 横向滚动条 */
          overflow-y: auto; /* 需要纵向滚动可保留auto */
        }
      </style>
  
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Supplier</th>
    `;

  // 7.1 输出其余列表头
  columnKeys.forEach((col) => {
    html += `<th>${col}</th>`;
  });
  html += `
            </tr>
          </thead>
          <tbody>
    `;

  // 7.2 逐个 Supplier 输出行
  Object.keys(aggregatedData).forEach((supplier) => {
    html += `<tr>`;
    // 第 1 列: Supplier
    html += `<td>${supplier}</td>`;

    // 后续列: 取到汇总值, 转成两位小数, 若为 0 则留空
    columnKeys.forEach((col) => {
      const val = aggregatedData[supplier][col] || 0;
      // 转成两位小数
      const twoDec = parseFloat(val.toFixed(2));
      html += `<td>${twoDec === 0 ? "" : twoDec}</td>`;
    });

    html += `</tr>`;
  });

  html += `
          </tbody>
        </table>
      </div>
    `;
  const mergeBudgetHtml = generateMergeBudget(aggregatedData);
  return [html, mergeBudgetHtml];
}

// 获取当前时间并格式化为 Month_Day
function getCurrentTime() {
  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'short' });
  const day = now.getDate();
  return `${month}_${day}`;
}

// 定义数据源
const maindata = {};


const summaryHtmlString = generateHTMLTable(maindata)[0];
const mergedHtmlString = generateHTMLTable(maindata)[1]+appendAggregatedDataDescription(maindata);
require("fs").writeFileSync(
  `./public/html/vendorHtmlTable${getCurrentTime()}.html`,
  summaryHtmlString,
  "utf8"
);
require("fs").writeFileSync(
  `private/2025Apr/mergedTable${getCurrentTime()}.html`,
  mergedHtmlString,
  "utf8"
);
