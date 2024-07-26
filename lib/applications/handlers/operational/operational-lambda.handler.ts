import axios, { AxiosError } from "axios";
import { Logger } from "@aws-lambda-powertools/logger";
import {
  IncomingWebhook,
  IncomingWebhookResult,
  IncomingWebhookSendArguments,
} from "@slack/webhook";
import {
  CloudWatchAlarmStateChangeEvent,
  CloudWatchAlarmStateChangeHandler,
  StateValue,
} from "./alarms.types";

export interface Image {
  title: string;
  url: string;
  alt: string;
}

export interface BlockKitProps {
  header: {
    title: string;
    emoji: SlackEmoji;
  };
  description: {
    text: string;
    link: string;
  };
  reason: string;
  image?: Image;
}

export enum SlackEmoji {
  BANG_BANG = ":bangbang:",
  WARNING = ":warning:",
  WHITE_CHECK_MARK = ":white_check_mark:",
}

function buildAlarmBlockKit(
  props: BlockKitProps
): IncomingWebhookSendArguments {
  const alarmBlockKit: IncomingWebhookSendArguments = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${props.header.emoji} ${props.header.title}`,
          emoji: true,
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: props.description.text,
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "See More",
            emoji: true,
          },
          value: "see-more-call-to-action",
          url: props.description.link,
          action_id: "see-more-action",
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "plain_text",
            text: props.reason,
            emoji: true,
          },
        ],
      },
      {
        type: "divider",
      },
      {
        type: "context",
        elements: [
          {
            type: "plain_text",
            text: `Environment: ${process.env.ENVIRONMENT}`,
            emoji: true,
          },
        ],
      },
    ],
  };

  if (props.image) {
    // Since alarmBlockKit was built with the blocks property, it is safe to assume that it is not undefined.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    alarmBlockKit.blocks!.push(
      {
        type: "divider",
      },
      {
        type: "image",
        title: {
          type: "plain_text",
          text: props.image.title,
          emoji: true,
        },
        image_url: props.image.url,
        alt_text: props.image.alt,
      }
    );
  }

  return alarmBlockKit;
}

const buildBlockKitProps = (
  event: CloudWatchAlarmStateChangeEvent
): BlockKitProps => {
  const eventData = event.alarmData;

  const headerEmoji = getTitleEmoji(eventData.state.value);
  const headerTitle = eventData.alarmName;

  const descriptionText = eventData.configuration.description;
  const descriptionLink = `https://${event.region}.console.aws.amazon.com/cloudwatch/home?region=${event.region}#alarmsV2:alarm/${eventData.alarmName}`;

  const reason = eventData.state.reason;

  const props: BlockKitProps = {
    header: {
      emoji: headerEmoji,
      title: headerTitle,
    },
    description: {
      text: descriptionText,
      link: descriptionLink,
    },
    reason: reason,
  };

  return props;
};

export const handler: CloudWatchAlarmStateChangeHandler<void> = async (
  event,
  context
) => {
  const logger = new Logger();
  logger.info("Received event", { event });

  const env = process.env.ENVIRONMENT || "dev";

  const blockKitProps = buildBlockKitProps(event);

  const blockKit: IncomingWebhookSendArguments =
    buildAlarmBlockKit(blockKitProps);

  const incomingWebhook = new IncomingWebhook(process.env.SLACK_CHANNEL!);
  await incomingWebhook.send(blockKit);
};

const getTitleEmoji = (state: StateValue): SlackEmoji => {
  switch (state) {
    case StateValue.ALARM:
      return SlackEmoji.BANG_BANG;
    case StateValue.OK:
      return SlackEmoji.WHITE_CHECK_MARK;
    case StateValue.INSUFFICIENT_DATA:
      return SlackEmoji.WARNING;
  }
};
