#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { CustomerChurnMlStack } from "../lib/customer-churn-ml-stack";

const app = new cdk.App();
new CustomerChurnMlStack(app, "CustomerChurnMlStack");
