const https = require('follow-redirects').https;
const fs = require('fs');
const crypto = require('crypto');
const OAuth = require('oauth-1.0a');
const path = require("path");  // ✅ 引入 path 模块
require('dotenv').config();


// 你的 NetSuite API 认证信息
const CONSUMER_KEY = process.env.CONSUMER_KEY;
const CONSUMER_SECRET = process.env.CONSUMER_SECRET;
const TOKEN_ID = process.env.TOKEN_ID;
const TOKEN_SECRET = process.env.TOKEN_SECRET;
const ACCOUNT_ID = process.env.ACCOUNT_ID;
const API_HOSTNAME = process.env.API_HOSTNAME;
const API_PATH = process.env.API_PATH;
const API_URL = `https://${API_HOSTNAME}${API_PATH}`;

// 获取当前时间并格式化为 MM_DD_HH_MM
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

// 生成文件名
const filename = `Record_${getCurrentTime()}.json`;

const options = {
    method: 'GET',
    hostname: API_HOSTNAME,
    path: API_PATH,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': getOAuthHeader("GET", API_URL) // 生成的 Authorization 头
    },
    maxRedirects: 20
};

const req = https.request(options, function (res) {
    let chunks = [];

    res.on("data", function (chunk) {
        chunks.push(chunk);
    });

    res.on("end", function () {
        const body = Buffer.concat(chunks).toString();
        const privateDir = path.resolve(__dirname, "../../private");  // ✅ 计算 private 目录的绝对路径
        const filePath = path.join(privateDir, filename);  // ✅ 目标文件路径

        // 确保 private 目录存在
        if (!fs.existsSync(privateDir)) {
            fs.mkdirSync(privateDir, { recursive: true });
        }

        // 将 JSON 解析并保存到文件
        try {
            const jsonData = JSON.parse(body); // 解析 JSON
            fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), "utf8");
            console.log(`✅ 数据已保存到 ${filePath}`);
        } catch (error) {
            console.error("❌ JSON 解析失败:", error);
            console.error("❌ API 返回数据:", body);
        }
    });

    res.on("error", function (error) {
        console.error("❌ 请求失败:", error);
    });
});

req.end();
