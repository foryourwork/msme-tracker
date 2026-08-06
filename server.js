const express = require('express');
const cors = require('cors');
const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const cheerio = require('cheerio');
const http = require('http');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

const app = express();
app.use(cors());
app.use(express.json());

// Continuous Connection Reuse Agents
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });

// OPTIONAL: Proxy Rotation Config (यदि आप Paid/Free Proxies लिस्ट यूज़ कर रहे हैं)
// const PROXIES = ['http://user:pass@proxy1.com:8080', 'http://user:pass@proxy2.com:8080'];
// const getProxyAgent = () => new HttpsProxyAgent(PROXIES[Math.floor(Math.random() * PROXIES.length)]);

// Dynamic User Agents for Anti-Bot Bypass
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

const getRandomHeader = () => ({
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
});

// Configure Axios Instance with Auto-Retry
const axiosClient = axios.create({
    timeout: 10000,
    httpAgent,
    httpsAgent
});

// AUTO-RETRY LOGIC: 20 req/sec पर फ़ेल होने पर स्वचालित रीट्राई
axiosRetry(axiosClient, {
    retries: 2, // फ़ेल होने पर 2 बार फिर से कोशिश करेगा
    retryDelay: (retryCount) => {
        return retryCount * 1000; // पहला रीट्राई 1 सेकंड बाद, दूसरा 2 सेकंड बाद
    },
    retryCondition: (error) => {
        // Network Error या 429/502/503/504 स्टेटस पर ऑटो-रीट्राई
        return axiosRetry.isNetworkOrIdempotentRequestError(error) || 
               (error.response && [429, 500, 502, 503, 504].includes(error.response.status));
    }
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const tradeMap = { '1': 'Halwai (हलवाई)' };

app.post('/api/track', async (req, res) => {
    const appId = req.body.app_id ? req.body.app_id.toString().trim() : '';
    if (!appId) return res.json({ status: 'error', message: 'Invalid Application ID' });

    try {
        // High Speed Micro Delay (10ms - 25ms)
        await sleep(Math.floor(Math.random() * 15) + 10);

        // 1. Get Application Status
        const statusResponse = await axiosClient.post(
            'https://msme.up.gov.in/Home/Get_ApplicationStatusData',
            new URLSearchParams({ username: appId }),
            { headers: getRandomHeader() }
        );

        let statusData = statusResponse.data;

        if (!statusData || statusData.status === null || statusData.status === "-1" || statusData.status === -1) {
            return res.json({ status: 'error', message: 'Record Not Found' });
        }

        if (Array.isArray(statusData) && statusData.length > 0) {
            statusData = statusData[0];
        }

        let rawTrade = (statusData.trade_code || statusData.trade_id || statusData.trade_name || statusData.Trade || '').toString().trim();

        // 2. Secondary HTML Scraping if Trade Name Missing
        if (!rawTrade || rawTrade === 'N/A' || rawTrade === 'NA') {
            try {
                const printResponse = await axiosClient.post(
                    'https://msme.up.gov.in/Vishwakarma/Application_Print',
                    new URLSearchParams({ application_no: appId }),
                    { headers: getRandomHeader() }
                );

                if (printResponse.data) {
                    const $ = cheerio.load(printResponse.data);
                    const tdText = $("td:contains('ट्रेड जिसके हेतु आवेदन किया गया')").next('td').text().trim();
                    if (tdText) rawTrade = tdText;
                }
            } catch (e) {
                // Secondary fallback failure ignored to maintain throughput
            }
        }

        const tradeName = tradeMap[rawTrade] || rawTrade || 'NA';

        return res.json({
            info: {
                App_Id: statusData.App_Id || statusData.app_id || appId,
                applicant_name: statusData.applicant_name || statusData.Name || 'N/A',
                scheme_name: statusData.scheme_name || 'विश्वकर्मा श्रम सम्मान योजना (VSSY)',
                trade_name: tradeName,
                district_name: statusData.district_name || 'N/A',
                status_str: statusData.status_str || 'Synced',
                mobile_no: statusData.mobile_no || ''
            }
        });
    } catch (err) {
        return res.json({ status: 'error', message: 'Server Connection Error: ' + err.message });
    }
});

app.listen(5000, () => {
    console.log("---------------------------------------------------------");
    console.log("20 Req/Sec Ultra Engine + Axios Retry Active on Port 5000");
    console.log("---------------------------------------------------------");
});