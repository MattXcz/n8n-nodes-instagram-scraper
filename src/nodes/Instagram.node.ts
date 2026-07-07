import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

import { IInstagramCredentials } from '../lib/types';
import { InstagramClient } from '../lib/client';
import { Utils } from '../lib/utils';

export class Instagram implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Instagram Scraper',
		name: 'instagram',
		icon: 'file:instagram.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Extract Instagram post/reel metadata (title, caption, thumbnail, likes...) using a logged-in session, including 18+ content',
		defaults: {
			name: 'Instagram Scraper',
		},
		inputs: ['main'],
		outputs: ['main'],
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

			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Delay Between Items (Ms)',
						name: 'delayBetweenItems',
						type: 'number',
						typeOptions: {
							minValue: 0,
						},
						default: 2000,
						description:
							'When multiple items are passed into this node in one run (e.g. from a Split In Batches / Loop node), requests for item 2 onward are delayed by a random amount between this value and 2x this value before running. Instagram flags many requests fired back-to-back from the same session as bot traffic (checkpoint_required) even if each one alone would be fine. Set to 0 to disable.',
					},
				],
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

		// Cache the session produced by a real username/password login in the
		// workflow's static data, so it persists across executions and we
		// only hit Instagram's login endpoint again when the cached session
		// actually stops working (repeated automated logins are themselves a
		// pattern Instagram flags).
		const staticData = this.getWorkflowStaticData('global') as {
			instagramSessionData?: string;
			instagramSessionUsername?: string;
		};

		try {
			if (credentials.sessionData && credentials.sessionData.trim()) {
				// Explicit manual override always wins.
				await client.login(credentials);
			} else if (credentials.sessionId && credentials.csrfToken) {
				// Explicit cookie fallback.
				await client.login(credentials);
			} else if (credentials.username && credentials.password) {
				let usedCache = false;
				if (
					staticData.instagramSessionData &&
					staticData.instagramSessionUsername === credentials.username
				) {
					try {
						await client.login({ ...credentials, sessionData: staticData.instagramSessionData });
						usedCache = true;
					} catch {
						// Cached session expired or was rejected - fall through to a fresh login below.
					}
				}
				if (!usedCache) {
					const loginResult = await client.loginWithPassword(credentials.username, credentials.password);
					staticData.instagramSessionData = loginResult.sessionData;
					staticData.instagramSessionUsername = credentials.username;
				}
			} else {
				throw new Error(
					'Provide Username + Password (recommended), or Session ID + CSRF Token, or Session Data in the Instagram API credential.',
				);
			}
		} catch (error) {
			throw new NodeOperationError(
				this.getNode(),
				`Instagram authentication failed: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				{ itemIndex: 0 },
			);
		}

		for (let i = 0; i < items.length; i++) {
			// Multiple items in one execution (e.g. from a Split In
			// Batches / Loop node feeding several URLs into this node at
			// once) hit Instagram back-to-back with no gap at all, which
			// looks nothing like a human browsing and gets the session
			// checkpoint-flagged after a few requests - even though a
			// single request on its own works fine. Space item 2+ out with
			// a small randomized delay to look less like a scraper.
			if (i > 0) {
				const options = this.getNodeParameter('options', i, {}) as { delayBetweenItems?: number };
				const delayBetweenItems = options.delayBetweenItems ?? 2000;
				if (delayBetweenItems > 0) {
					await Utils.randomDelay(delayBetweenItems, delayBetweenItems * 2);
				}
			}

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
				if (this.continueOnFail()) {
					const nodeError = new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
					const errorItem: INodeExecutionData = {
						json: { error: nodeError.message },
						pairedItem: { item: i },
					};
					// This mirrors the pattern n8n's own core nodes use (e.g.
					// Salesforce.node.ts): only set `.error` when the node's
					// "On Error" setting is specifically "Continue Using Error
					// Output" - that's what makes the workflow engine route
					// this item to the node's dedicated Error output branch
					// instead of the regular one. `json.error` above still
					// carries a readable message either way, for workflows
					// using the older plain "Continue" setting (single
					// output, no error branch).
					if (this.getNode().onError === 'continueErrorOutput') {
						errorItem.error = nodeError;
					}
					returnData.push(errorItem);
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
