const express = require('express');
const cors = require('cors');
const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const cheerio = require('cheerio');
const http = require('http');
const https = require('https');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// KeepAlive Agents for Maximum Throughput
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });

// Dynamic User Agents
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0'
];

const getRandomHeader = () => ({
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
});

const axiosClient = axios.create({
    timeout: 12000,
    httpAgent,
    httpsAgent
});

axiosRetry(axiosClient, {
    retries: 2,
    retryDelay: (retryCount) => retryCount * 1000,
    retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) || 
               (error.response && [429, 500, 502, 503, 504].includes(error.response.status));
    }
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const tradeMap = { '1': 'Halwai (हलवाई)' };

// Render पर index.html सीधे इसी Server से सर्व करने के लिए
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Primary Tracking API
app.post('/api/track', async (req, res) => {
    const appId = req.body && req.body.app_id ? req.body.app_id.toString().trim() : '';
    if (!appId) return res.status(400).json({ status: 'error', message: 'Invalid Application ID' });

    try {
        await sleep(Math.floor(Math.random() * 15) + 10);

        // Fetch Main Status
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

        // Secondary Scraping if trade is missing
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
            } catch (e) {}
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
        console.error("Backend Error for App ID:", appId, err.message);
        return res.status(500).json({ status: 'error', message: 'MSME Portal Error: ' + err.message });
    }
});

// Dynamic Port Binding for Render
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server Active on Port ${PORT}`);
});
