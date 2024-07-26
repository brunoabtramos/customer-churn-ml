import { Handler } from "aws-lambda";

/**
 * @tutorial https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch-and-eventbridge.html
 */
export type CloudWatchAlarmStateChangeHandler<TResult> = Handler<
  CloudWatchAlarmStateChangeEvent,
  TResult
>;

export type CloudWatchAlarmStateChangeEvent = {
  accountId: string;
  alarmArn: string;
  time: string;
  region: string;
  source: string;
  alarmData: CloudWatchAlarmStateChangeEventData;
};
export interface CloudWatchAlarmStateChangeEventData {
  alarmName: string;
  state: AlarmState;
  previousState: AlarmState;
  configuration: AlarmConfiguration;
}

export interface AlarmConfiguration {
  description: string;
  metrics: Array<MetricDataQuery>;
}

/**
 * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_MetricDataQuery.html
 */
export interface MetricDataQuery {
  /**
   * A short name used to tie this object to the query results.
   */
  id: string;
  /**
   * The ID of the account where the metrics are located.
   */
  accountId?: string;
  /**
   * his field can contain either a Metrics Insights query, or a metric math expression to be performed on the returned data.
   */
  expression?: string;
  /**
   * A human-readable label for this metric or expression.
   */
  label?: string;
  /**
   * The metric to be returned, along with statistics, period, and units.
   */
  metricStat?: MetricStat;
  /**
   * The granularity, in seconds, of the returned data points
   */
  period?: number;
  /**
   * Whether to return the timestamps and raw data values of this metric.
   */
  returnData?: boolean;
}

/**
 * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_MetricStat.html
 */
export interface MetricStat {
  /**
   * The metric to return, including the metric name, namespace, and dimensions.
   */
  metric: Metric;
  /**
   * The granularity, in seconds, of the returned data points.
   * For metrics with regular resolution, a period can be as short as one minute (60 seconds) and must be a multiple of 60.
   * For high-resolution metrics that are collected at intervals of less than one minute, the period can be 1, 5, 10, 30, 60, or any multiple of 60.
   */
  period: number;
  /**
   * The statistic to return. It can include any CloudWatch statistic or extended statistic.
   */
  stat: string;
  /**
   * The unit for the metric.
   */
  unit?: MetricUnit;
}

export enum MetricUnit {
  SECONDS = "Seconds",
  MICROSECONDS = "Microseconds",
  MILLISECONDS = "Milliseconds",
  BYTES = "Bytes",
  KILOBYTES = "Kilobytes",
  MEGABYTES = "Megabytes",
  GIGABYTES = "Gigabytes",
  TERABYTES = "Terabytes",
  BITS = "Bits",
  KILOBITS = "Kilobits",
  MEGABITS = "Megabits",
  GIGABITS = "Gigabits",
  TERABITS = "Terabits",
  PERCENT = "Percent",
  COUNT = "Count",
  BYTES_PER_SECOND = "Bytes/Second",
  KILOBYTES_PER_SECOND = "Kilobytes/Second",
  MEGABYTES_PER_SECOND = "Megabytes/Second",
  GIGABYTES_PER_SECOND = "Gigabytes/Second",
  TERABYTES_PER_SECOND = "Terabytes/Second",
  BITS_PER_SECOND = "Bits/Second",
  KILOBITS_PER_SECOND = "Kilobits/Second",
  MEGABITS_PER_SECOND = "Megabits/Second",
  GIGABITS_PER_SECOND = "Gigabits/Second",
  TERABITS_PER_SECOND = "Terabits/Second",
}

/**
 * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_Metric.html
 */
export interface Metric {
  name: string;
  namespace: string;
  dimensions: { [key: string]: string };
}

export interface AlarmState {
  /**
   * The state value for the alarm.
   */
  value: StateValue;
  /**
   * An explanation for the alarm state, in text format.
   */
  reason: string;
  /**
   * An explanation for the alarm state, in JSON format.
   */
  reasonData: string;
  /**
   * The timestamp when the alarm entered in this state.
   */
  timestamp: string;
}

export enum StateValue {
  OK = "OK",
  ALARM = "ALARM",
  INSUFFICIENT_DATA = "INSUFFICIENT_DATA",
}
