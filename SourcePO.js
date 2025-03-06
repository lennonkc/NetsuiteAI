const https = require('follow-redirects').https;
const fs = require('fs');
const crypto = require('crypto');
const OAuth = require('oauth-1.0a');

// 你的 NetSuite API 认证信息
const CONSUMER_KEY = "53e93d8bf95714a0998acaaaf0605637069e3535c36b548604ee3cd3ef935810";
const CONSUMER_SECRET = "7995206a7a4269a5601e196444d4297a7fdacb5aa978385d129958856bbf37d2";
const TOKEN_ID = "f9bdd95a9f4f2459c412cce3935ef459877e1d15b44c2803dce79adfbb7231bc";
const TOKEN_SECRET = "643e22769cdbc15a8fe529d415c796bd5bd9d3da6385c4db3103916712a8ca80";
const ACCOUNT_ID = "5377549_SB2";  
const API_HOSTNAME = "5377549-sb2.restlets.api.netsuite.com";
const API_PATH = "/app/site/hosting/restlet.nl?script=8512&deploy=1";
const API_URL = `https://${API_HOSTNAME}${API_PATH}`;

// 获取当前时间并格式化为 MM_DD_HH_MM
function getCurrentTime() {
    const now = new Date();
    return `${String(now.getMonth() + 1).padStart(2, '0')}_${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}_${String(now.getMinutes()).padStart(2, '0')}`;
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

        // 将 JSON 解析并保存到文件
        try {
            const jsonData = JSON.parse(body); // 解析 JSON
            fs.writeFileSync(filename, JSON.stringify(jsonData, null, 2), 'utf8');
            console.log(`✅ 数据已保存到 ${filename}`);
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
