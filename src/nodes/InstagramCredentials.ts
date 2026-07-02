import {
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

export class InstagramCredentials implements ICredentialType {
	name = 'instagramApi';
	displayName = 'Instagram API';
	documentationUrl = 'https://github.com/MattXcz/n8n-nodes-instagram-scraper';
	properties: INodeProperties[] = [
		{
			displayName: 'Session ID',
			name: 'sessionId',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description:
				'Value of the "sessionid" cookie from a browser logged into the Instagram account you want to use (DevTools -> Application -> Cookies -> instagram.com). Paste it exactly as shown, including any %3A characters. Never share it, and use a dedicated account rather than your main one.',
			placeholder: '9704031%3ANJkCFvYd4AQyia%3A21%3A...',
		},
		{
			displayName: 'CSRF Token',
			name: 'csrfToken',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'Value of the "csrftoken" cookie from the same browser session, next to sessionid in DevTools',
			placeholder: 'a1b2c3d4e5f6...',
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

	async authenticate(
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		return requestOptions;
	}

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://www.instagram.com',
			url: '/',
			method: 'GET',
		},
	};
}
