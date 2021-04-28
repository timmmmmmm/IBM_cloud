'use strict';

/* eslint-env node, es6 */
require('dotenv').config({ silent: true });
const express = require('express');
const app = express();
const AssistantV2 = require('ibm-watson/assistant/v2');
const { IamTokenManager } = require('ibm-watson/auth');
const { IamAuthenticator } = require('ibm-watson/auth');
var context = {};
var debug = false;
let comment;
const fs = require('fs');
const https = require('https');

const assistant = new AssistantV2({
    version: '2020-04-01',
    authenticator: new IamAuthenticator({
        apikey: 'Q7m5IOrCDhhyxCO2MArBqqp3vzN5GXkIwDJqswOjanfu',
    }),
    serviceUrl: 'https://api.us-south.assistant.watson.cloud.ibm.com/instances/fbfad994-0eca-483e-9936-928f3e8c4097',
});

let sessionId;
assistant.createSession({
    assistantId: '51a953e1-6dd7-4f62-922c-35b815c72ed0'
})
    .then(res => {
        sessionId = res.result.session_id;
    })
    .catch(err => {
        console.log(err);
    });


//設定介面
const port = process.env.PORT || process.env.VCAP_APP_PORT || 3000;
app.listen(port, function () {
    console.log('Example IBM Watson Speech JS SDK client app & token server live at http://localhost:%s/', port);
});

if (!process.env.VCAP_SERVICES) {

    const HTTPS_PORT = 3001;

    const options = {
        key: fs.readFileSync(__dirname + '/keys/localhost.pem'),
        cert: fs.readFileSync(__dirname + '/keys/localhost.cert')
    };
    https.createServer(options, app).listen(HTTPS_PORT, function () {
        console.log('Secure server live at https://localhost:%s/', HTTPS_PORT);
    });
}
;
var path = require('path');
var bodyParser = require('body-parser');
// //parse application/x-www-form-urlencoded
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/scripts', express.static(__dirname + '/node_modules/'));
app.use('/image', express.static(__dirname + '/image/'));
// In case the caller calls GET to the root '/', return 'views/index.html' file.
app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, 'test.html'));
});

// on bluemix, enable rate-limiting and force https
if (process.env.VCAP_SERVICES) {
    // enable rate-limiting
    const RateLimit = require('express-rate-limit');
    app.enable('trust proxy'); // required to work properly behind Bluemix's reverse proxy

    const limiter = new RateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
        delayMs: 0 // disable delaying - full speed until the max limit is reached
    });

    //  apply to /api/*
    app.use('/api/', limiter);

    // force https - microphone access requires https in Chrome and possibly other browsers
    // (*.mybluemix.net domains all have built-in https support)
    const secure = require('express-secure-only');
    app.use(secure());
    app.use(express.static(__dirname + '/static'));

}

const sttAuthenticator = new IamTokenManager({
    apikey: 'On-WwLuZQhOlTTMLsoOb53Tu2wMYNxQjvLccdNY4L5j4'
});

//Text To Speech
const ttsAuthenticator = new IamTokenManager({
    apikey: 'afX25HKHWgmziIDq4DCghoCywHcJKTr8uFQGoHHLNbLa'
});

app.use('/api/text-to-speech/token', function (req, res) {
    return ttsAuthenticator
        .requestToken()
        .then(({ result }) => {
            res.json({ accessToken: result.access_token, url: 'https://api.us-south.text-to-speech.watson.cloud.ibm.com/instances/fbfedb7e-e2ca-4ba5-b52d-bcb04cc59058' });
        })
        .catch(console.error);
});

// token endpoints
// speech to text token endpoint
app.use('/api/speech-to-text/token', function (req, res) {
    return sttAuthenticator
        .requestToken()
        .then(({ result }) => {
            res.json({ accessToken: result.access_token, url: 'https://api.us-south.speech-to-text.watson.cloud.ibm.com/instances/f82a2a8e-3fe2-4bec-a1e2-e496a5fb286c' });
        })
        .catch(console.error);
});

/* Log Watson Assistant context values, so we can follow along with its logic. */
function printContext(header) {
    if (debug) {
        console.log(header);

        if (context.system) {
            if (context.system.dialog_stack) {
                const util = require('util');
                console.log("     dialog_stack: ['" +
                    util.inspect(context.system.dialog_stack, false, null) + "']");
            }
        }
    }
}

/* Log significant responses from Watson to the console. */
function watsonSays(response) {
    if (typeof (response) !== 'undefined') {
        console.log('Watson says:', response);
    }
}

/* Determine if we are ready to talk, or need a wake up command */
fs.writeFile('response.txt', '', function (err) {
    if (err) {
        return console.log(err);
    }
});
/* Keep conversation with user alive until it breaks */
function performConversation() {
    console.log('App is listening, you may speak now.');

    app.post('/data', function (req, res) {//獲取client輸入之內容
        var obj = {};
        var txt = req.body.text;

        // userSpeechText = txt.toLowerCase();
        console.log('\n\nApp hears: ', txt);
        assistant.message({
            assistantId: '51a953e1-6dd7-4f62-922c-35b815c72ed0',
            sessionId: sessionId,
            input: { 'text': txt },

        }).then(res => {
            if (res.result.output.generic) {
                if (res.result.output.generic.length > 0) {
                    if (res.result.output.generic[0].response_type === 'text') {
                        comment = res.result.output.generic[0].text
                        console.log(comment);
                        app.get('/return', function (req, res) {
                            res.setHeader('Content-type', 'text/html')
                            res.sendFile(comment);
                        });
                    };
                }
            }
        }
        )
            .catch(err => {
                console.log(err); // something went wrong
            });
    });
}
app.get('/return', function (req, res) {
    res.setHeader('Content-type', 'text/html')
    res.send(comment);
})


performConversation();
