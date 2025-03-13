// services/vendorID.js
const https = require('follow-redirects').https;
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OAuth = require('oauth-1.0a');
require('dotenv').config();

// NetSuite API 信息
const CONSUMER_KEY = process.env.CONSUMER_KEY;
const CONSUMER_SECRET = process.env.CONSUMER_SECRET;
const TOKEN_ID = process.env.TOKEN_ID;
const TOKEN_SECRET = process.env.TOKEN_SECRET;
const ACCOUNT_ID = process.env.ACCOUNT_ID;
const API_HOSTNAME = process.env.API_HOSTNAME_SUITETALK;
const API_PATH = process.env.API_PATH_SUITEQL;
const API_URL = `https://${API_HOSTNAME}${API_PATH}`;

// 获取当前时间并格式化为 Month_Day
function getCurrentTime() {
  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'short' });
  const day = now.getDate();
  return `${month}_${day}`;
}

// 生成 OAuth 认证头
function getOAuthHeader(method, url) {
  const oauth = OAuth({
    consumer: { key: CONSUMER_KEY, secret: CONSUMER_SECRET },
    signature_method: 'HMAC-SHA256',
    hash_function(baseString, key) {
      return crypto
        .createHmac('sha256', key)
        .update(baseString)
        .digest('base64');
    },
  });

  const token = { key: TOKEN_ID, secret: TOKEN_SECRET };
  const authData = oauth.authorize({ url, method }, token);

  return (
    `OAuth realm="${ACCOUNT_ID}", ` +
    `oauth_consumer_key="${authData.oauth_consumer_key}", ` +
    `oauth_token="${authData.oauth_token}", ` +
    `oauth_nonce="${authData.oauth_nonce}", ` +
    `oauth_timestamp="${authData.oauth_timestamp}", ` +
    `oauth_signature_method="${authData.oauth_signature_method}", ` +
    `oauth_version="1.0", ` +
    `oauth_signature="${encodeURIComponent(authData.oauth_signature)}"`
  );
}

/**
 * 发送 HTTPS POST 请求，并返回响应体
 * @param {Object} options - https.request 的配置
 * @param {string} postData - 需要发送的请求体
 * @returns {Promise<string>} - 返回字符串形式的响应体
 */
function httpsPost(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString();
        resolve(responseBody);
      });
    });
    req.on('error', (err) => reject(err));
    req.write(postData);
    req.end();
  });
}

/**
 * 基于 Record JSON 文件，查询供应商信息并生成 Vendor JSON
 * @param {string} recordFilePath - 上一步生成的 Record JSON 文件路径
 * @returns {Promise<string>} - 返回保存后的 Vendor JSON 文件绝对路径
 */
async function fetchVendorData(recordFilePath) {
  try {
    // 读取 JSON 文件
    const rawData = fs.readFileSync(recordFilePath, 'utf8');
    const jsonData = JSON.parse(rawData);

    if (!jsonData.success || !Array.isArray(jsonData.data)) {
      throw new Error('数据格式错误或 JSON 结构无效');
    }

    // 提取所有 `ID` 组成 VendorIDList
    const VendorIDList = [
      ...new Set(jsonData.data.map((item) => item.ID).filter(Boolean)),
    ];
    if (VendorIDList.length === 0) {
      throw new Error('没有找到任何有效的 Vendor ID');
    }
    console.log('✅ 提取到了 Vendor ID:')
    // console.log('✅ 提取到了 Vendor ID:', VendorIDList);

    // 构造 SQL 查询
    const sqlQuery = `
      SELECT v.id, v.entityid, v.terms, v.companyname, t.name AS term_name
      FROM vendor v
      LEFT JOIN term t ON v.terms = t.id
      WHERE v.entityid IN ('${VendorIDList.join("','")}')
    `;

    // 构造请求选项
    const options = {
      method: 'POST',
      hostname: API_HOSTNAME,
      path: API_PATH,
      headers: {
        Prefer: 'transient',
        'Content-Type': 'application/json',
        Authorization: getOAuthHeader('POST', API_URL),
      },
      maxRedirects: 20,
    };

    // 发起请求
    const responseBody = await httpsPost(
      options,
      JSON.stringify({ q: sqlQuery })
    );

    // 生成 Vendor JSON 文件名
    const outputFile = `VendorID_${getCurrentTime()}.json`;
    const privateDir = path.resolve(__dirname, '../../private');
    const filePath = path.join(privateDir, outputFile);

    // 确保 private 目录存在
    if (!fs.existsSync(privateDir)) {
      fs.mkdirSync(privateDir, { recursive: true });
    }

    // 解析并写入文件
    let responseJson;
    try {
      responseJson = JSON.parse(responseBody);
    } catch (err) {
      console.error('❌ API 返回的数据不是有效的 JSON:', responseBody);
      throw new Error('返回数据不是有效 JSON');
    }

    fs.writeFileSync(filePath, JSON.stringify(responseJson, null, 2), 'utf8');
    console.log(`✅ 数据已保存到 ${filePath}`);

    return filePath;
  } catch (error) {
    console.error('❌ 获取 Vendor Data 失败:', error);
    throw error;
  }
}

// 导出函数供外部调用
module.exports = {
  fetchVendorData,
};
