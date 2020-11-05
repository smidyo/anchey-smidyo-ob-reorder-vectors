import AWS from 'aws-sdk';
import fetch from 'node-fetch';
import { SvgDocument } from './SvgDocument';
import { Strategy } from './SvgPathReorderUtils';

const LambdaService = new AWS.Lambda();

exports.handler = async ({
	payload,
	tempPayloadletFilesDomain,
	getTempPayloadletFileUploadURLsFunctionARN,
}: {
	payload: {
		svg: Array<{
			svg: string;
			originalFilename?: string;
			unit?: string;
		}>;
		strategy: ['start-end' | 'centroid'];
		'use-physical-dimensions'?: [] | [boolean | null];
	};
	tempPayloadletFilesDomain: string;
	getTempPayloadletFileUploadURLsFunctionARN: string;
}) => {
	const svgs = payload.svg;
	const [strategy] = payload.strategy;
	const [usePhysicalDimensions] = payload['use-physical-dimensions'] || [
		false,
	];

	try {
		const reOrderedSVGs = await Promise.all(
			svgs.map(async (svg) => {
				const svgData = await fetch(
					'https://' + tempPayloadletFilesDomain + '/' + svg.svg,
				).then((res) => res.text());

				const [reOrderedSVG] = await SvgDocument.fromString(
					svgData,
				).then((docs) =>
					docs.map((d) => {
						d.reorderPaths(
							{
								'start-end': Strategy.START_END,
								centroid: Strategy.CENTROID,
							}[strategy],
						);
						return d.toString(usePhysicalDimensions || false);
					}),
				);

				const uploadURLRes = await LambdaService.invoke({
					FunctionName: getTempPayloadletFileUploadURLsFunctionARN,
					Payload: JSON.stringify({
						forFiles: [{ extension: 'svg' }],
					}),
				}).promise();

				const [uploadInfo] = JSON.parse(uploadURLRes.Payload as string);

				await fetch(uploadInfo.uploadURL, {
					method: 'PUT',
					body: reOrderedSVG,
				});

				return {
					svg: uploadInfo.fileKey,
					originalFilename: svg.originalFilename,
					unit: 'px',
				};
			}),
		);

		return {
			type: 'OPERATION_BLOCK_RESULT_OUTCOME',
			result: {
				'reordered-svg': reOrderedSVGs,
			},
		};
	} catch (err) {
		return {
			type: 'REJECTION_OUTCOME',
			rejection: 'Could not reorder vectors.',
			error: {
				message: err.message,
				stack: err.stack,
			},
		};
	}
};
