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
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			description:
				'Instagram username (without @). Fill this in together with Password and everything else is automatic: the node logs in once, caches the resulting session, and only logs in again if that cached session ever expires or gets rejected. Use a dedicated automation account if possible, not your main one.',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'Instagram password, used only to log in (and re-login if the cached session expires). Leave Username/Password empty if you prefer one of the advanced options below instead.',
		},
		{
			displayName: 'Session ID (Advanced)',
			name: 'sessionId',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description:
				'Alternative to Username/Password: value of the "sessionid" cookie from a browser logged into Instagram (DevTools -> Application -> Cookies -> instagram.com). Paste it exactly as shown, including any %3A characters. More prone to triggering Instagram security checkpoints than a real login.',
			placeholder: '9704031%3ANJkCFvYd4AQyia%3A21%3A...',
		},
		{
			displayName: 'CSRF Token (Advanced)',
			name: 'csrfToken',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'Used together with Session ID above. Value of the "csrftoken" cookie from the same browser session.',
			placeholder: 'a1b2c3d4e5f6...',
		},
		{
			displayName: 'Session Data (Advanced)',
			name: 'sessionData',
			type: 'string',
			typeOptions: {
				password: true,
				rows: 3,
			},
			default: '',
			description:
				'Manually paste a previously generated session (only needed if you want to bypass automatic login/caching entirely). Takes priority over all fields above if set.',
			placeholder: '{"cookies":"...","deviceString":"...", ...}',
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
