import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType,
} from 'n8n-workflow';

import { IInstagramCredentials } from '../lib/types';
import { InstagramClient } from '../lib/client';

export class Instagram implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Instagram Scraper',
		name: 'instagram',
		icon: 'file:instagram.svg',
		group: ['social'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Extract Instagram post/reel metadata (title, caption, thumbnail, likes...) using a logged-in session, including 18+ content',
		defaults: {
			name: 'Instagram Scraper',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'instagramApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Post', value: 'post' },
					{ name: 'Media', value: 'media' },
					{ name: 'User', value: 'user' },
					{ name: 'Feed', value: 'feed' },
				],
				default: 'post',
			},

			// Post Operations
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['post'],
					},
				},
				options: [
					{
						name: 'Get Info by URL',
						value: 'getInfoByUrl',
						description: 'Get title, caption, thumbnail and stats for a post/reel URL',
						action: 'Get info for a post or reel by URL',
					},
				],
				default: 'getInfoByUrl',
			},
			{
				displayName: 'Post / Reel URL',
				name: 'url',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['post'],
						operation: ['getInfoByUrl'],
					},
				},
				default: '',
				placeholder: 'https://www.instagram.com/reel/DLwUswhN6Ax/',
				description: 'Full URL of the Instagram post, reel or IGTV video',
				required: true,
			},

			// Media Operations (direct numeric media ID lookup)
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['media'],
					},
				},
				options: [
					{
						name: 'Get Media Info',
						value: 'getMediaInfo',
						description: 'Get detailed information about a media item by its numeric media ID',
						action: 'Get detailed information about a media item',
					},
				],
				default: 'getMediaInfo',
			},
			{
				displayName: 'Media ID',
				name: 'mediaId',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['media'],
						operation: ['getMediaInfo'],
					},
				},
				default: '',
				description: 'Numeric Instagram media ID (not the shortcode). Use "Post -> Get Info by URL" instead if you only have the post URL.',
				required: true,
			},

			// User Operations
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['user'],
					},
				},
				options: [
					{
						name: 'Get Profile Info',
						value: 'getUserInfo',
						description: 'Get user profile information',
						action: 'Get user profile information',
					},
				],
				default: 'getUserInfo',
			},
			{
				displayName: 'Username',
				name: 'username',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['getUserInfo'],
					},
				},
				default: '',
				description: 'Instagram username (without @)',
				required: true,
			},

			// Feed Operations
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['feed'],
					},
				},
				options: [
					{
						name: 'Get Timeline Feed',
						value: 'getTimelineFeed',
						description: 'Get posts from the timeline feed of the logged-in account',
						action: 'Get posts from timeline feed',
					},
				],
				default: 'getTimelineFeed',
			},
			{
				displayName: 'Max ID',
				name: 'maxId',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['feed'],
						operation: ['getTimelineFeed'],
					},
				},
				default: '',
				description: 'Pagination cursor from a previous call (leave empty for the first page)',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		const credentials = (await this.getCredentials('instagramApi')) as IInstagramCredentials;
		const client = new InstagramClient(credentials);

		try {
			await client.loadSession(credentials.sessionData);
		} catch (error) {
			throw new NodeOperationError(
				this.getNode(),
				`Instagram authentication failed: ${
					error instanceof Error ? error.message : 'Unknown error'
				}. Please extract a fresh session and update your credentials.`,
				{ itemIndex: 0 },
			);
		}

		for (let i = 0; i < items.length; i++) {
			try {
				let responseData: any;

				if (resource === 'post' && operation === 'getInfoByUrl') {
					const url = this.getNodeParameter('url', i) as string;
					responseData = await client.getPostByUrl(url);
				} else if (resource === 'media' && operation === 'getMediaInfo') {
					const mediaId = this.getNodeParameter('mediaId', i) as string;
					responseData = await client.getMediaInfo(mediaId);
				} else if (resource === 'user' && operation === 'getUserInfo') {
					const username = this.getNodeParameter('username', i) as string;
					responseData = await client.getUserInfo(username);
				} else if (resource === 'feed' && operation === 'getTimelineFeed') {
					const maxId = this.getNodeParameter('maxId', i, undefined) as string | undefined;
					responseData = await client.getTimelineFeed(maxId || undefined);
				}

				if (responseData === undefined) {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not supported for resource "${resource}"`,
						{ itemIndex: i },
					);
				}

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(responseData),
					{ itemData: { item: i } },
				);
				returnData.push(...executionData);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);

				if (this.continueOnFail()) {
					const executionErrorData = this.helpers.constructExecutionMetaData(
						this.helpers.returnJsonArray({ error: errorMessage }),
						{ itemData: { item: i } },
					);
					returnData.push(...executionErrorData);
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
