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
	documentationUrl = 'https://github.com/YOUR_GITHUB_USERNAME/n8n-nodes-instagram-scraper';
	properties: INodeProperties[] = [
		{
			displayName: 'Session Data',
			name: 'sessionData',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description:
				'Instagram session data as JSON, e.g. {"cookies":[...],"sessionId":"..."}. Extract it from a browser logged into the account you want to use (sessionid + csrftoken cookies), never share it, and use a dedicated account rather than your main one.',
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
