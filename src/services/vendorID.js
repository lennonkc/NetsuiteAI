// 根据Record_Mar_7.json文件中的ID字段，查询NetSuite中的供应商信息，并将term_name结果保存到VendorID_Month_Day.json文件中。
// 1. 读取Record_Mar_7.json文件，提取所有的ID字段，组成VendorIDList。
// 2. 构造SQL查询，查询NetSuite中的供应商信息,获取term_name。
// 3. 将查询结果保存到VendorID_Month_Day.json文件中。

const https = require('follow-redirects').https;
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OAuth = require('oauth-1.0a');


// 你的 NetSuite API 认证信息
const CONSUMER_KEY = "53e93d8bf95714a0998acaaaf0605637069e3535c36b548604ee3cd3ef935810";
const CONSUMER_SECRET = "7995206a7a4269a5601e196444d4297a7fdacb5aa978385d129958856bbf37d2";
const TOKEN_ID = "f9bdd95a9f4f2459c412cce3935ef459877e1d15b44c2803dce79adfbb7231bc";
const TOKEN_SECRET = "643e22769cdbc15a8fe529d415c796bd5bd9d3da6385c4db3103916712a8ca80";
const ACCOUNT_ID = "5377549_SB2";  // 例如 12345-sb2
const API_HOSTNAME = `5377549-sb2.suitetalk.api.netsuite.com`;
const API_PATH = "/services/rest/query/v1/suiteql";
const API_URL = `https://${API_HOSTNAME}${API_PATH}`;

// 获取当前时间并格式化为 Month_Day
function getCurrentTime() {
    const now = new Date();
    const month = now.toLocaleString('en-US', { month: 'short' }); // 获取英文缩写月份，如 "Mar"
    const day = now.getDate(); // 获取日期，如 5

    return `${month}_${day}`;
}

// 生成 OAuth 认证头
function getOAuthHeader(method, url) {
    const oauth = OAuth({
        consumer: { key: CONSUMER_KEY, secret: CONSUMER_SECRET },
        signature_method: "HMAC-SHA256",
        hash_function(base_string, key) {
            return crypto.createHmac('sha256', key).update(base_string).digest('base64');
        }
    });

    const token = { key: TOKEN_ID, secret: TOKEN_SECRET };
    const authData = oauth.authorize({ url, method }, token);

    return `OAuth realm="${ACCOUNT_ID}", ` +
        `oauth_consumer_key="${authData.oauth_consumer_key}", ` +
        `oauth_token="${authData.oauth_token}", ` +
        `oauth_nonce="${authData.oauth_nonce}", ` +
        `oauth_timestamp="${authData.oauth_timestamp}", ` +
        `oauth_signature_method="${authData.oauth_signature_method}", ` +
        `oauth_version="1.0", ` +
        `oauth_signature="${encodeURIComponent(authData.oauth_signature)}"`;
}

// 读取 JSON 文件
const inputFile = "private/Record_Mar_7.json"; // 确保文件在当前目录
const outputFile = `VendorID_${getCurrentTime()}.json`;

try {
    const rawData = fs.readFileSync(inputFile, 'utf8');
    const jsonData = JSON.parse(rawData);

    if (!jsonData.success || !Array.isArray(jsonData.data)) {
        throw new Error("数据格式错误或 JSON 结构无效");
    }

    // 提取所有 `ID` 组成 VendorIDList
    const VendorIDList = [...new Set(jsonData.data.map(item => item.ID).filter(Boolean))];

    if (VendorIDList.length === 0) {
        throw new Error("没有找到任何有效的 Vendor ID");
    }

    console.log("✅ 提取的 Vendor ID:", VendorIDList);

    // 构造 SQL 查询
    // const sqlQuery = `SELECT id, entityid, terms, companyname, FROM vendor WHERE entityid IN ('${VendorIDList.join("', '")}')`;
     // 构造优化的 SuiteQL 查询，使用 LEFT JOIN 直接查询 term 表
     const sqlQuery = `
     SELECT v.id, v.entityid, v.terms, v.companyname, t.name AS term_name
     FROM vendor v
     LEFT JOIN term t ON v.terms = t.id
     WHERE v.entityid IN ('${VendorIDList.join("', '")}')
 `;

    const options = {
        method: 'POST',
        hostname: API_HOSTNAME,
        path: API_PATH,
        headers: {
            'Prefer': 'transient',
            'Content-Type': 'application/json',
            'Authorization': getOAuthHeader("POST", API_URL) // 生成的 Authorization 头
        },
        maxRedirects: 20
    };

    const req = https.request(options, function (res) {
        let chunks = [];

        res.on("data", function (chunk) {
            chunks.push(chunk);
        });

        res.on("end", function () {
            const responseBody = Buffer.concat(chunks).toString();
            const privateDir = path.resolve(__dirname, "../../private");  // ✅ 计算 private 目录的绝对路径
            const filePath = path.join(privateDir, outputFile);  // ✅ 目标文件路径

            try {
                const responseJson = JSON.parse(responseBody);

                // 保存返回数据到 JSON 文件
                fs.writeFileSync(filePath, JSON.stringify(responseJson, null, 2), 'utf8');
                console.log(`✅ 数据已保存到 ${filePath}`);
            } catch (error) {
                console.error("❌ API 返回的数据不是有效的 JSON:", responseBody);
            }
        });

        res.on("error", function (error) {
            console.error("❌ 请求失败:", error);
        });
    });

    // 发送 SQL 查询
    const postData = JSON.stringify({ "q": sqlQuery });
    req.write(postData);
    req.end();

} catch (error) {
    console.error("❌ 处理失败:", error);
}