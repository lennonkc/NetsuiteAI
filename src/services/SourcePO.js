// services/SourcePO.js
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
const API_HOSTNAME = process.env.API_HOSTNAME;
const API_PATH = process.env.API_PATH;
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
 * 发送 HTTPS GET 请求，并返回响应体
 * @param {Object} options - https.request 的配置
 * @returns {Promise<string>} - 返回字符串形式的响应体
 */
function httpsGet(options) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        resolve(body);
      });
    });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

/**
 * 获取并保存 Record JSON 文件
 * @returns {Promise<string>} - 返回保存后的文件绝对路径
 */
async function fetchRecordData() {
  try {
    const filename = `Record_${getCurrentTime()}.json`;
    const privateDir = path.resolve(__dirname, '../../private');
    const filePath = path.join(privateDir, filename);

    // 确保 private 目录存在
    if (!fs.existsSync(privateDir)) {
      fs.mkdirSync(privateDir, { recursive: true });
    }

    // 构造请求选项
    const options = {
      method: 'GET',
      hostname: API_HOSTNAME,
      path: API_PATH,
      headers: {
        'Content-Type': 'application/json',
        Authorization: getOAuthHeader('GET', API_URL),
      },
      maxRedirects: 20,
    };

    // 发起请求
    const body = await httpsGet(options);

    // 解析并写入文件
    let jsonData;
    try {
      jsonData = JSON.parse(body);
    } catch (err) {
      console.error('❌ JSON 解析失败:', err);
      console.error('❌ API 返回数据:', body);
      throw new Error('JSON 解析失败');
    }

    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf8');
    console.log(`✅ 数据已保存到 ${filePath}`);

    return filePath;
  } catch (error) {
    console.error('❌ 获取 Record Data 失败:', error);
    throw error;
  }
}

// 导出函数供外部调用
module.exports = {
  fetchRecordData,
};
