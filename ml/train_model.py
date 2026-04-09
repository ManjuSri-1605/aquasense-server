"""
Train a simple Random Forest on synthetic LDR data.
Run once: python train_model.py
Outputs: ../backend/model/rf_model.joblib
"""
import os, numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import joblib

rng = np.random.default_rng(42)

def make_samples(base30, base60, base120, label, n=300):
    noise = rng.normal(0, 15, (n, 3))
    X = np.clip(np.array([[base30, base60, base120]]) + noise, 0, 1023)
    y = np.full(n, label)
    return X, y

X_clean, y_clean = make_samples(820, 790, 750, 0)
X_low,   y_low   = make_samples(560, 530, 490, 1)
X_high,  y_high  = make_samples(310, 275, 230, 2)

X = np.vstack([X_clean, X_low, X_high])
y = np.concatenate([y_clean, y_low, y_high])

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

clf = RandomForestClassifier(n_estimators=100, random_state=42)
clf.fit(X_train, y_train)

print(classification_report(y_test, clf.predict(X_test), target_names=["Clean","Low","High"]))

out_dir = os.path.join(os.path.dirname(__file__), "../backend/model")
os.makedirs(out_dir, exist_ok=True)
joblib.dump(clf, os.path.join(out_dir, "rf_model.joblib"))
print("Model saved to backend/model/rf_model.joblib")
