const axios = require('axios');
require('dotenv').config();

const code = "1000.d00900169442de8540e96feed8dd02bc.6a7cd3ce74bfce5a6e349b6e8484335a";
const clientId = process.env.ZOHO_CLIENT_ID;
const clientSecret = process.env.ZOHO_CLIENT_SECRET;

async function exchangeCode() {
    try {
        console.log("Exchanging code for tokens...");
        const response = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, {
            params: {
                grant_type: 'authorization_code',
                client_id: clientId,
                client_secret: clientSecret,
                code: code
            }
        });
        console.log("RESPONSE SUCCESS:");
        console.log(response.data);
    } catch (error) {
        console.error("RESPONSE ERROR:");
        if (error.response && error.response.data) {
            console.error(error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

exchangeCode();
