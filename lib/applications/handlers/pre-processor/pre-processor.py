#!/usr/bin/env python3

import pandas as pd
import numpy as np
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, lit, date_sub, round as _round
from pyspark.sql.types import StringType, IntegerType
from pyspark.sql import functions as F

# Initialize Spark session
spark = SparkSession.builder.appName("data_pipelines_tutorial").getOrCreate()

# Load data (replace with your actual data sources)
def load_data():
    data = {
        "account_id": [1, 2, 3, 4, 5],
        "age": [25, 34, 45, 23, 35],
        "gender": ["M", "F", "M", "F", "M"],
        "balance": [1000.0, 1500.5, 1200.75, 1100.0, 1300.0],
        "transactions_last_month": [5, 12, 8, 15, 10],
        "account_created_at": ["2021-01-01", "2020-06-15", "2019-11-20", "2021-03-10", "2020-12-05"],
        "will_churn": [0, 1, 0, 1, 0]
    }
    df = pd.DataFrame(data)
    return df

# Preprocess data
def preprocess_data(spark_df):
    # Handle missing values
    spark_df = spark_df.fillna({
        "age": spark_df.agg(F.mean('age')).first()[0],
        "gender": spark_df.agg(F.first('gender')).first()[0],
        "balance": spark_df.agg(F.mean('balance')).first()[0],
        "transactions_last_month": spark_df.agg(F.mean('transactions_last_month')).first()[0],
    })

    # Convert categorical features to numerical
    spark_df = spark_df.withColumn('gender', F.when(col('gender') == 'M', 0).otherwise(1))

    # Calculate account age in months
    reference_date = lit('2024-06-22')
    spark_df = spark_df.withColumn('account_created_at', F.to_date(col('account_created_at')))
    spark_df = spark_df.withColumn('account_age_months', ((F.datediff(reference_date, col('account_created_at')) / 30).cast(IntegerType())))

    # Drop the original date column
    spark_df = spark_df.drop('account_created_at')

    return spark_df

# Save data to S3
def save_to_s3(spark_df, bucket_name, file_path):
    spark_df.write.mode("overwrite").parquet(f"s3a://{bucket_name}/{file_path}")

# Main script
if __name__ == "__main__":
    # Load data into pandas DataFrame
    df = load_data()
    
    # Convert pandas DataFrame to Spark DataFrame
    spark_df = spark.createDataFrame(df)
    
    # Preprocess data
    spark_df = preprocess_data(spark_df)
    
    # Save preprocessed data to S3
    bucket_name = "your-s3-bucket-name"
    file_path = "path/to/save/preprocessed_data"
    save_to_s3(spark_df, bucket_name, file_path)
    
    print("Data preprocessing complete and saved to S3.")
