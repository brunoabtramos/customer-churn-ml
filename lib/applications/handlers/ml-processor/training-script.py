#!/usr/bin/env python3

import pandas as pd
import numpy as np
import boto3
import joblib
import tarfile
import io
import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split, GridSearchCV, cross_val_score
from sklearn.naive_bayes import GaussianNB
from sklearn.neural_network import MLPClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, roc_auc_score, confusion_matrix, classification_report, roc_curve, auc

# Initialize S3 client
s3 = boto3.client('s3')

# Function to load data from S3
def load_data_from_s3(bucket_name, dataset_prefix):
    response = s3.list_objects_v2(Bucket=bucket_name, Prefix=dataset_prefix)
    file_keys = [obj['Key'] for obj in response.get('Contents', []) if obj['Key'].endswith('.parquet')]
    dfs = [pd.read_parquet(f's3://{bucket_name}/{file_key}') for file_key in file_keys]
    return pd.concat(dfs, ignore_index=True)

# Function to train and evaluate models
def train_and_evaluate_models(X_train, y_train, X_test, y_test):
    models = {
        'Naive Bayes': (GaussianNB(), {}),
        'ANN': (MLPClassifier(max_iter=1000), {'hidden_layer_sizes': [(50,50,50), (50,100,50), (100,)]}),
        'Logistic Regression': (LogisticRegression(max_iter=300), {'C': [0.1, 1.0, 10.0]}),
        'SVM': (SVC(probability=True), {'C': [0.1, 1.0, 10.0]}),
        'Decision Tree': (DecisionTreeClassifier(), {'max_depth': [None, 10, 20, 30]})
    }
    results = {}
    for model_name, (model, param_grid) in models.items():
        print(f"Training {model_name}...")
        grid_search = GridSearchCV(model, param_grid, cv=5, scoring='roc_auc', n_jobs=-1)
        grid_search.fit(X_train, y_train)
        best_model = grid_search.best_estimator_
        y_pred = best_model.predict(X_test)
        y_pred_prob = best_model.predict_proba(X_test)[:, 1] if hasattr(best_model, "predict_proba") else None
        results[model_name] = {
            'Accuracy': accuracy_score(y_test, y_pred),
            'Precision': precision_score(y_test, y_pred),
            'Recall': recall_score(y_test, y_pred),
            'ROC AUC': roc_auc_score(y_test, y_pred_prob) if y_pred_prob is not None else None,
            'Confusion Matrix': confusion_matrix(y_test, y_pred),
            'Classification Report': classification_report(y_test, y_pred),
            'Best Params': grid_search.best_params_,
            'Cross Validation Scores': cross_val_score(best_model, X_train, y_train, cv=5),
            'ROC Curve': roc_curve(y_test, y_pred_prob) if y_pred_prob is not None else None
        }
    return results

# Function to plot ROC curves
def plot_roc_curves(results):
    plt.figure(figsize=(12, 8))
    for model_name, metrics in results.items():
        if 'ROC Curve' in metrics:
            fpr, tpr, roc_auc = metrics['ROC Curve']
            plt.plot(fpr, tpr, label=f'{model_name} (AUC = {roc_auc:.2f})')
    plt.plot([0, 1], [0, 1], 'k--')
    plt.xlim([0.0, 1.0])
    plt.ylim([0.0, 1.05])
    plt.xlabel('False Positive Rate')
    plt.ylabel('True Positive Rate')
    plt.title('ROC Curves')
    plt.legend(loc='lower right')
    plt.show()

# Main script
if __name__ == "__main__":
    bucket_name = 'your-bucket-name'
    dataset_prefix = 'path/to/dataset/'
    df = load_data_from_s3(bucket_name, dataset_prefix)
    
    X = df.drop(columns=['will_churn', 'account_id'])
    y = df['will_churn']
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    results = train_and_evaluate_models(X_train, y_train, X_test, y_test)
    plot_roc_curves(results)
    
    for model_name, metrics in results.items():
        print(f"Model: {model_name}")
        print(f"Accuracy: {metrics['Accuracy']}")
        print(f"Precision: {metrics['Precision']}")
        print(f"Recall: {metrics['Recall']}")
        print(f"ROC AUC: {metrics['ROC AUC']}")
        print("Confusion Matrix:")
        print(metrics['Confusion Matrix'])
        print("Classification Report:")
        print(metrics['Classification Report'])
        print(f"Cross Validation Scores: {metrics['Cross Validation Scores']}")
        print("-" * 60)
