import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.getenv('SECRET_KEY', 'change-me-in-production')
DEBUG = os.getenv('DEBUG', 'True').lower() == 'true'
ALLOWED_HOSTS = ['*']

INSTALLED_APPS = [
    'corsheaders',
    'rest_framework',
    'feedback',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
]

# CORS — mirrors the Node server's ALLOWED_ORIGINS env var
_origins = os.getenv('ALLOWED_ORIGINS', '')
if _origins:
    CORS_ALLOWED_ORIGINS = [o.strip() for o in _origins.split(',') if o.strip()]
else:
    CORS_ALLOW_ALL_ORIGINS = True

CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'origin',
    'user-agent',
    'x-requested-with',
]
CORS_ALLOW_METHODS = [
    'GET',
    'POST',
    'OPTIONS',
]

ROOT_URLCONF = 'feedback_server.urls'

# Support Render's DATABASE_URL or individual DB_* env vars
_database_url = os.getenv('DATABASE_URL')
if _database_url:
    import urllib.parse
    _parsed = urllib.parse.urlparse(_database_url)
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': _parsed.path.lstrip('/'),
            'USER': _parsed.username,
            'PASSWORD': _parsed.password,
            'HOST': _parsed.hostname,
            'PORT': _parsed.port or 5432,
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('DB_NAME', 'postgres'),
            'USER': os.getenv('DB_USER', 'postgres'),
            'PASSWORD': os.getenv('DB_PASSWORD', 'postgres'),
            'HOST': os.getenv('DB_HOST', '127.0.0.1'),
            'PORT': os.getenv('DB_PORT', '5432'),
        }
    }

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.AllowAny'],
    'UNAUTHENTICATED_USER': None,
    # Allow large payloads for screenshots (matches Node's 10mb limit)
    'DEFAULT_PARSER_CLASSES': ['rest_framework.parsers.JSONParser'],
}

# 10MB upload limit for screenshot payloads
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Frontend calls /api/feedback without trailing slash — let Django handle both
APPEND_SLASH = True

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_TZ = True
