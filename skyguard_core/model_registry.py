"""
SkyGuard Core — LightGBM Model Registry
Provides runtime access to the trained root-cause classifier.
Falls back to rule-based classification (skyguard_core.classifier) when no
serialized model is available.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional, Tuple

import numpy as np

logger = logging.getLogger("SkyGuard.ModelRegistry")

# Default model path relative to this file's directory
_DEFAULT_MODEL_PATH = Path(__file__).parent / "models" / "lgbm_classifier.joblib"

# Runtime model handle — populated by load() or register_model()
_model = None
_model_path: Optional[Path] = None


def load(model_path: Optional[str] = None) -> bool:
    """
    Attempt to load the serialized LightGBM classifier.

    Parameters
    ----------
    model_path : path to the .joblib file.  If None, uses the default path
                 (skyguard_core/models/lgbm_classifier.joblib).

    Returns
    -------
    True if loaded successfully, False if file not found (rule-based fallback used).
    """
    global _model, _model_path
    target = Path(model_path) if model_path else _DEFAULT_MODEL_PATH

    if not target.exists():
        logger.warning(
            "LightGBM model not found at %s. "
            "Running in rule-based fallback mode. "
            "Run ML/ml_analytics_pipeline.py first to train and serialise the model.",
            target,
        )
        return False

    try:
        import joblib
        _model = joblib.load(target)
        _model_path = target
        logger.info("Loaded LightGBM classifier from %s", target)
        return True
    except Exception as exc:
        logger.error("Failed to load LightGBM model from %s: %s", target, exc)
        return False


def register_model(model) -> None:
    """Register a freshly-trained model object (called from ml_analytics_pipeline)."""
    global _model
    _model = model
    logger.info("LightGBM model registered in-process.")


def save(model, path: Optional[str] = None) -> Path:
    """
    Serialise a trained model to disk.  Called by ml_analytics_pipeline after training.
    Creates the models/ directory if needed.
    """
    import joblib

    target = Path(path) if path else _DEFAULT_MODEL_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, target)
    logger.info("LightGBM model saved to %s", target)
    register_model(model)
    return target


def is_loaded() -> bool:
    return _model is not None


def predict(features_array: np.ndarray) -> Tuple[int, float, np.ndarray]:
    """
    Run inference using the loaded LightGBM model.

    Parameters
    ----------
    features_array : 1-D or 2-D numpy array of shape (15,) or (N, 15)

    Returns
    -------
    (predicted_class_int, confidence, proba_vector)

    Raises
    ------
    RuntimeError if no model is loaded.
    """
    if _model is None:
        raise RuntimeError(
            "No LightGBM model loaded. Call ModelRegistry.load() first "
            "or run ml_analytics_pipeline.py to train and save the model."
        )

    arr = np.atleast_2d(features_array)
    proba = _model.predict_proba(arr)
    cls_idx = int(proba.argmax(axis=1)[0])
    confidence = float(proba[0, cls_idx])
    return cls_idx, confidence, proba[0]
