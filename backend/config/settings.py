import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'unsafe-development-key')
DEBUG = os.getenv('DJANGO_DEBUG', '1') == '1'
ALLOWED_HOSTS = os.getenv('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1,testserver').split(',')
INSTALLED_APPS = ['django.contrib.admin','django.contrib.auth','django.contrib.contenttypes','django.contrib.sessions','django.contrib.messages','django.contrib.staticfiles','rest_framework','tracker']
MIDDLEWARE = ['django.middleware.security.SecurityMiddleware','django.contrib.sessions.middleware.SessionMiddleware','django.middleware.common.CommonMiddleware','django.middleware.csrf.CsrfViewMiddleware','django.contrib.auth.middleware.AuthenticationMiddleware','django.contrib.messages.middleware.MessageMiddleware','tracker.audit.CurrentUserMiddleware']
ROOT_URLCONF = 'config.urls'
TEMPLATES = [{'BACKEND':'django.template.backends.django.DjangoTemplates','DIRS':[],'APP_DIRS':True,'OPTIONS':{'context_processors':['django.template.context_processors.request','django.contrib.auth.context_processors.auth','django.contrib.messages.context_processors.messages']}}]
WSGI_APPLICATION = 'config.wsgi.application'
if os.getenv('POSTGRES_DB'):
    DATABASES = {'default': {'ENGINE':'django.db.backends.postgresql','NAME':os.environ['POSTGRES_DB'],'USER':os.getenv('POSTGRES_USER','postgres'),'PASSWORD':os.getenv('POSTGRES_PASSWORD',''),'HOST':os.getenv('POSTGRES_HOST','localhost'),'PORT':os.getenv('POSTGRES_PORT','5432')}}
else:
    DATABASES = {'default': {'ENGINE':'django.db.backends.sqlite3','NAME': BASE_DIR / 'db.sqlite3'}}
AUTH_PASSWORD_VALIDATORS = []
LANGUAGE_CODE='en-us'; TIME_ZONE='Asia/Kolkata'; USE_I18N=True; USE_TZ=True
STATIC_URL='static/'
DEFAULT_AUTO_FIELD='django.db.models.BigAutoField'
CSRF_COOKIE_HTTPONLY=False
REST_FRAMEWORK={'DEFAULT_AUTHENTICATION_CLASSES':['rest_framework.authentication.SessionAuthentication'],'DEFAULT_PERMISSION_CLASSES':['rest_framework.permissions.IsAuthenticated'],'DEFAULT_PAGINATION_CLASS':'rest_framework.pagination.PageNumberPagination','PAGE_SIZE':50}
