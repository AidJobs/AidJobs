"""
Secrets resolution utility for API source configuration.
Resolves {{SECRET:NAME}} syntax from environment variables.
"""
import os
import re
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

SECRET_PATTERN = re.compile(r'\{\{SECRET:([A-Za-z0-9_]+)\}\}')


def resolve_secrets(value: Any) -> Any:
    """
    Resolve {{SECRET:NAME}} patterns in a value.
    
    Supports:
    - Strings: "Bearer {{SECRET:API_TOKEN}}" -> "Bearer actual_token"
    - Dicts: Recursively resolves all values
    - Lists: Recursively resolves all items
    - Other types: Returns as-is
    
    Returns:
        Resolved value with secrets replaced
    """
    if isinstance(value, str):
        def replace_secret(match):
            secret_name = match.group(1)
            secret_value = os.getenv(secret_name)
            if secret_value is None:
                logger.warning(f"[secrets] Secret '{secret_name}' not found in environment")
                return match.group(0)  # Return original pattern if not found
            return secret_value
        
        return SECRET_PATTERN.sub(replace_secret, value)
    elif isinstance(value, dict):
        return {k: resolve_secrets(v) for k, v in value.items()}
    elif isinstance(value, list):
        return [resolve_secrets(item) for item in value]
    else:
        return value


def mask_secrets(value: Any, mask_char: str = "*") -> Any:
    """
    Mask secret values in a value for logging/display.
    
    Replaces {{SECRET:NAME}} patterns with masked values.
    
    Returns:
        Value with secrets masked
    """
    if isinstance(value, str):
        def mask_secret(match):
            secret_name = match.group(1)
            return f"{{{{SECRET:{secret_name}}}}}"
        
        # Also mask if it looks like it might contain a secret
        if SECRET_PATTERN.search(value):
            return SECRET_PATTERN.sub(mask_secret, value)
        return value
    elif isinstance(value, dict):
        return {k: mask_secrets(v, mask_char) for k, v in value.items()}
    elif isinstance(value, list):
        return [mask_secrets(item, mask_char) for item in value]
    else:
        return value


def check_required_secrets(config: Dict[str, Any]) -> list[str]:
    """
    Check if all required secrets are present in environment.
    
    Returns:
        List of missing secret names
    """
    missing = []
    
    def find_secrets(value: Any):
        if isinstance(value, str):
            for match in SECRET_PATTERN.finditer(value):
                secret_name = match.group(1)
                if os.getenv(secret_name) is None:
                    if secret_name not in missing:
                        missing.append(secret_name)
        elif isinstance(value, dict):
            for v in value.values():
                find_secrets(v)
        elif isinstance(value, list):
            for item in value:
                find_secrets(item)
    
    find_secrets(config)
    return missing

