import { Duration, Stack, StackProps, Size } from "aws-cdk-lib";
import * as ecrdeploy from "cdk-ecr-deployment";
import { Construct } from "constructs";
import {
  PolicyStatement,
  PolicyDocument,
  Role,
  CompositePrincipal,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { CfnApplication } from "aws-cdk-lib/aws-emrserverless";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import {
  CallAwsService,
  LambdaInvoke,
  SageMakerCreateTransformJob,
  SageMakerCreateTrainingJob,
  InputMode,
  S3DataType,
  S3DataDistributionType,
  S3Location,
  DockerImage,
} from "aws-cdk-lib/aws-stepfunctions-tasks";
import { CfnModel } from "aws-cdk-lib/aws-sagemaker";
import {
  StateMachine,
  Condition,
  Choice,
  Fail,
  Wait,
  WaitTime,
  Pass,
  JsonPath,
} from "aws-cdk-lib/aws-stepfunctions";
import { Alarm, ComparisonOperator } from "aws-cdk-lib/aws-cloudwatch";
import { Rule } from "aws-cdk-lib/aws-events";
import { LambdaAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { join } from "path";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { InstanceType } from "aws-cdk-lib/aws-ec2";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { start } from "repl";

export class CustomerChurnMlStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const repository = new Repository(this, "CustomerChurnTrainingRepository", {
      repositoryName: "customer-churn-training-repository",
    });

    // Build and push the Docker image to the ECR repository
    const dockerImage = new DockerImageAsset(
      this,
      "CustomerChurnTrainingImage",
      {
        directory: join(__dirname, "./../"),
      }
    );

    new ecrdeploy.ECRDeployment(this, "ECRDeployment", {
      src: new ecrdeploy.DockerImageName(dockerImage.imageUri),
      dest: new ecrdeploy.DockerImageName(`${repository.repositoryUri}:latest`),
    });

    const stepFunctionExecutionRole = new Role(
      this,
      "StepFunctionExecutionRole",
      {
        assumedBy: new CompositePrincipal(
          new ServicePrincipal("emr-serverless.amazonaws.com"),
          new ServicePrincipal("states.amazonaws.com"),
          new ServicePrincipal("sagemaker.amazonaws.com")
        ),
        inlinePolicies: {
          policy: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [
                  "emr-serverless:StartJobRun",
                  "emr-serverless:ListApplications",
                  "emr-serverless:GetJobRun",
                  "emr-serverless:CancelJobRun",
                  "emr-serverless:CreateApplication",
                  "sts:AssumeRole",
                  "states:StartExecution",
                  "logs:CreateLogGroup",
                  "logs:CreateLogStream",
                  "logs:PutLogEvents",
                  "logs:CreateLogGroup",
                  "logs:CreateLogStream",
                  "logs:PutLogEvents",
                  "iam:PassRole",
                  "iam:GetRole",
                  "s3:AbortMultipartUpload",
                  "s3:GetBucketLocation",
                  "s3:GetObject",
                  "s3:ListBucket",
                  "s3:ListBucketMultipartUploads",
                  "s3:PutObject",
                  "s3:DeleteObject",
                  "sagemaker:CreateTrainingJob",
                  "sagemaker:CreateModel",
                  "sagemaker:CreateEndpointConfig",
                  "sagemaker:CreateEndpoint",
                  "sagemaker-runtime:InvokeEndpoint",
                  "ecr:BatchCheckLayerAvailability",
                  "ecr:BatchGetImage",
                  "ecr:GetDownloadUrlForLayer",
                ],
                resources: ["*"], // Consider specifying resource ARNs for tighter security
              }),
            ],
          }),
        },
      }
    );

    repository.grantPull(stepFunctionExecutionRole);

    const modelArtifactPath = `./best_model.tar.gz`;

    const churnModel = new CfnModel(this, "CustomerChurn", {
      executionRoleArn: stepFunctionExecutionRole.roleArn,
      primaryContainer: {
        image:
          "683313688378.dkr.ecr.us-east-1.amazonaws.com/sagemaker-scikit-learn:0.23-1-cpu-py3",
        modelDataUrl: modelArtifactPath,
        environment: {
          SAGEMAKER_SUBMIT_DIRECTORY: "/opt/ml/model/",
          SAGEMAKER_PROGRAM: "sagemaker_serve.py",
        },
      },
      modelName: "CustomerChurn",
    });

    // new PreProcessorConstructor(this, "PreProcessorConstructor");
    this.createStepFunction(
      stepFunctionExecutionRole,
      repository,
      dockerImage,
      churnModel
    );
  }

  private createStepFunction(
    stepFunctionExecutionRole: Role,
    repository: Repository,
    dockerImage: DockerImageAsset,
    churnModel: CfnModel
  ) {
    const serverlessApp = new CfnApplication(
      this,
      "CustomerChurnPreProcessor",
      {
        name: "CustomerChurnPreProcessor",
        releaseLabel: "emr-7.0.0",
        type: "SPARK",
      }
    );

    const startEmrJobRun = new CallAwsService(this, "RunEmrJob", {
      service: "EMRServerless",
      action: "startJobRun",
      parameters: {
        ApplicationId: serverlessApp.attrApplicationId,
        ExecutionRoleArn: stepFunctionExecutionRole.roleArn,
        Name: "PreprocessingJob",
        "ClientToken.$": "States.UUID()",
        JobDriver: {
          SparkSubmit: {
            EntryPoint: `entry_point.py`,
            SparkSubmitParameters: [
              "--conf",
              "spark.emr-serverless.driverEnv.PYSPARK_DRIVER_PYTHON=./environment/bin/python",
              "--conf",
              "spark.emr-serverless.driverEnv.PYSPARK_PYTHON=./environment/bin/python",
              "--conf",
              "spark.executorEnv.PYSPARK_PYTHON=./environment/bin/python",
            ].join(" "),
          },
        },
      },
      iamResources: ["*"],
      resultPath: "$.JobInfo",
    });

    const getEmrJobState = new CallAwsService(this, "GetEmrJobState", {
      service: "emrserverless",
      action: "getJobRun",
      parameters: {
        "ApplicationId.$": "$.JobInfo.ApplicationId",
        "JobRunId.$": "$.JobInfo.JobRunId",
      },
      iamResources: ["*"],
      resultPath: "$.JobStatus",
    });

    const emrJobStatusRetryWait = new Wait(this, "EmrJobStatusRetryWait", {
      time: WaitTime.duration(Duration.seconds(30)),
    });

    const emrJobFailureState = new Fail(this, "EmrJobFailureState", {
      cause: "EMR Job Failed",
      error: "JobStatusNotHandled",
    });

    const trainingJob = new SageMakerCreateTrainingJob(
      this,
      "CreateTrainingJob",
      {
        trainingJobName: JsonPath.stringAt("$$.Execution.Name"),
        algorithmSpecification: {
          trainingInputMode: InputMode.FILE,
          trainingImage: DockerImage.fromRegistry(
            repository.repositoryUri + ":latest"
          ),
        },
        inputDataConfig: [
          {
            channelName: "training",
            dataSource: {
              s3DataSource: {
                s3DataType: S3DataType.S3_PREFIX,
                s3Location: S3Location.fromBucket(
                  Bucket.fromBucketName(this, "TrainingDataBucket", `bucket`),
                  "caminho"
                ),
                s3DataDistributionType: S3DataDistributionType.FULLY_REPLICATED,
              },
            },
            contentType: "text/csv",
          },
        ],
        outputDataConfig: {
          s3OutputLocation: S3Location.fromBucket(
            Bucket.fromBucketName(this, "TrainingOutputBucket", `bucket`),
            "caminho"
          ),
        },
        resourceConfig: {
          instanceType: new InstanceType("m4.xlarge"),
          instanceCount: 1,
          volumeSize: Size.gibibytes(10),
        },
        stoppingCondition: {
          maxRuntime: Duration.hours(24),
        },
        role: stepFunctionExecutionRole,
      }
    );

    const emrJobStatusChoice = new Choice(this, "EmrJobStatusChoice")
      .when(
        Condition.stringEquals("$.JobStatus.JobRun.State", "SUCCESS"),
        trainingJob
      )
      .when(
        Condition.or(
          Condition.stringEquals("$.JobStatus.JobRun.State", "FAILED"),
          Condition.stringEquals("$.JobStatus.JobRun.State", "CANCELLED")
        ),
        emrJobFailureState
      )
      .otherwise(emrJobStatusRetryWait.next(getEmrJobState));

    const emrJobChain = startEmrJobRun
      .next(getEmrJobState)
      .next(emrJobStatusChoice);

    const getTrainingJobState = new CallAwsService(
      this,
      "GetTrainingJobState",
      {
        service: "sagemaker",
        action: "describeTrainingJob",
        parameters: {
          "TrainingJobName.$": "$.TrainingJobName",
        },
        iamResources: ["*"],
        resultPath: "$.TrainingJobStatus",
      }
    );

    const trainingJobStatusRetryWait = new Wait(
      this,
      "TrainingJobStatusRetryWait",
      {
        time: WaitTime.duration(Duration.seconds(30)),
      }
    );

    const trainingJobFailureState = new Fail(this, "TrainingJobFailureState", {
      cause: "Training Job Failed",
      error: "DescribeTrainingJob.Failed",
    });

    const runInference = new SageMakerCreateTransformJob(
      this,
      "RunInferenceJob",
      {
        transformJobName: JsonPath.stringAt("$$.Execution.Name"),
        modelName: churnModel.attrModelName,
        transformInput: {
          transformDataSource: {
            s3DataSource: {
              s3Uri: `caminho_input`,
            },
          },
          contentType: "application/x-parquet",
        },
        transformOutput: {
          s3OutputPath: `caminho_output`,
        },
        transformResources: {
          instanceType: new InstanceType("m4.xlarge"),
          instanceCount: 1,
        },
      }
    );

    const trainingJobStatusChoice = new Choice(this, "TrainingJobStatusChoice")
      .when(
        Condition.stringEquals(
          "$.TrainingJobStatus.TrainingJobStatus",
          "Completed"
        ),
        runInference
      )
      .when(
        Condition.or(
          Condition.stringEquals(
            "$.TrainingJobStatus.TrainingJobStatus",
            "Failed"
          ),
          Condition.stringEquals(
            "$.TrainingJobStatus.TrainingJobStatus",
            "Stopped"
          )
        ),
        trainingJobFailureState
      )
      .otherwise(trainingJobStatusRetryWait.next(getTrainingJobState));

    const trainingJobChain = trainingJob
      .next(getTrainingJobState)
      .next(trainingJobStatusChoice);

    const getTransformJobState = new CallAwsService(
      this,
      "GetTransformJobState",
      {
        service: "sagemaker",
        action: "describeTransformJob",
        parameters: {
          "TransformJobName.$": "$.TransformJobName",
        },
        iamResources: ["*"],
        resultPath: "$.TransformJobStatus",
      }
    );

    const transformJobStatusRetryWait = new Wait(
      this,
      "TransformJobStatusRetryWait",
      {
        time: WaitTime.duration(Duration.seconds(30)),
      }
    );

    const transformJobFailureState = new Fail(
      this,
      "TransformJobFailureState",
      {
        cause: "Transform Job Failed",
        error: "DescribeTransformJob.Failed",
      }
    );

    const eventProcessorLambda = new NodejsFunction(
      this,
      "EventProcessorLambda",
      {
        entry: join(
          __dirname,
          "./applications/handlers/event-processor/handler.ts"
        ),
        handler: "handler",
        runtime: Runtime.NODEJS_18_X,
        environment: {
          BUCKET_NAME: `bucket`,
          RESULTS_KEY: "caminho_resultados_inferencia",
          WEBHOOK_URL: "",
        },
      }
    );

    const eventProcessorTask = new LambdaInvoke(this, "EventProcessorTask", {
      lambdaFunction: eventProcessorLambda,
      resultPath: "$.Events",
    });

    const transformJobStatusChoice = new Choice(
      this,
      "TransformJobStatusChoice"
    )
      .when(
        Condition.stringEquals(
          "$.TransformJobStatus.TransformJobStatus",
          "Completed"
        ),
        eventProcessorTask
      )
      .when(
        Condition.or(
          Condition.stringEquals(
            "$.TransformJobStatus.TransformJobStatus",
            "Failed"
          ),
          Condition.stringEquals(
            "$.TransformJobStatus.TransformJobStatus",
            "Stopped"
          )
        ),
        transformJobFailureState
      )
      .otherwise(transformJobStatusRetryWait.next(getTransformJobState));

    const transformJobChain = runInference
      .next(getTransformJobState)
      .next(transformJobStatusChoice);

    const definition = emrJobChain;

    const stateMachine = new StateMachine(this, "CustomerChurnStateMachine", {
      definition,
      stateMachineName: "CustomerChurnStateMachine",
      timeout: Duration.hours(2),
      role: stepFunctionExecutionRole,
    });

    const failureRule = new Rule(this, "CustomerChurnStateMachineFailureRule", {
      eventPattern: {
        source: ["aws.states"],
        detailType: ["Step Functions Execution Status Change"],
        detail: {
          status: ["FAILED", "TIMED_OUT", "ABORTED"],
          stateMachineArn: [stateMachine.stateMachineArn],
        },
      },
    });

    const cloudwatchAlarm = new Alarm(this, "CustomerChurnStateMachineAlarm", {
      alarmName: "CustomerChurnStateMachineAlarm",
      metric: stateMachine.metricFailed({
        period: Duration.seconds(30),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription:
        "This Alarm triggers whenever the StepFunction in Customer Churn fails",
    });

    const operationalLambda = new NodejsFunction(this, "OperationalLambda", {
      entry: join(
        __dirname,
        "./applications/handlers/operational/operational-lambda.handler.ts"
      ),
      handler: "handler",
      runtime: Runtime.NODEJS_18_X,
      environment: {
        SLACK_CHANNEL: process.env.SLACK_URL ?? "",
        ENVIRONMENT: process.env.ENVIRONMENT ?? "",
      },
    });

    cloudwatchAlarm.addAlarmAction(new LambdaAction(operationalLambda));
  }
}
