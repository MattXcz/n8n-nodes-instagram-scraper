"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstagramCredentials = void 0;
class InstagramCredentials {
    constructor() {
        this.name = 'instagramApi';
        this.displayName = 'Instagram API';
        this.documentationUrl = 'https://github.com/MattXcz/n8n-nodes-instagram-scraper';
        this.properties = [
            {
                displayName: 'Session Data',
                name: 'sessionData',
                type: 'string',
                typeOptions: {
                    password: true,
                },
                default: '',
                required: true,
                description: 'Instagram session data as JSON, e.g. {"cookies":[...],"sessionId":"..."}. Extract it from a browser logged into the account you want to use (sessionid + csrftoken cookies), never share it, and use a dedicated account rather than your main one.',
                placeholder: '{"cookies":[...],"sessionId":"..."}',
            },
            {
                displayName: 'Proxy URL',
                name: 'proxyUrl',
                type: 'string',
                default: '',
                description: 'Optional HTTP proxy URL for requests',
                placeholder: 'http://proxy.example.com:8080',
            },
        ];
        this.test = {
            request: {
                baseURL: 'https://www.instagram.com',
                url: '/',
                method: 'GET',
            },
        };
    }
    async authenticate(credentials, requestOptions) {
        return requestOptions;
    }
}
exports.InstagramCredentials = InstagramCredentials;
//# sourceMappingURL=InstagramCredentials.js.map