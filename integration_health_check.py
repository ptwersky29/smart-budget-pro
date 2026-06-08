"""
Integration Health Check - Validates frontend↔backend communication and configuration
"""
import os
import sys
import json
from pathlib import Path
from typing import Dict, List, Any
from urllib.parse import urlparse, urljoin

# Color codes
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def colored(text: str, color: str) -> str:
    """Colorize console output"""
    if sys.platform == "win32":
        return text
    return f"{color}{text}{Colors.END}"

# ============================================================================
# 1. AXIOS/API CLIENT CONFIGURATION
# ============================================================================

class ApiClientValidator:
    """Validate frontend API client configuration"""
    
    def __init__(self, frontend_path: str):
        self.frontend_path = Path(frontend_path)
        
    def validate(self) -> Dict[str, Any]:
        """Validate API client setup"""
        return {
            'axios_config': self._check_axios_config(),
            'api_base_url': self._check_api_base_url(),
            'interceptors': self._check_interceptors(),
        }
    
    def _check_axios_config(self) -> Dict[str, Any]:
        """Check for axios configuration"""
        result = {
            'found': False,
            'files': [],
            'detail': '',
        }
        
        # Look for axios config or API service file
        lib_dir = self.frontend_path / 'src' / 'lib'
        if lib_dir.exists():
            api_files = list(lib_dir.glob('*api*')) + list(lib_dir.glob('*axios*'))
            result['files'] = [f.name for f in api_files]
            result['found'] = len(result['files']) > 0
        
        # Also check in hooks or utils
        hooks_dir = self.frontend_path / 'src' / 'hooks'
        if hooks_dir.exists():
            api_hooks = [f for f in hooks_dir.glob('*.js*') if 'api' in f.name.lower()]
            result['files'].extend([f.name for f in api_hooks])
        
        result['found'] = len(result['files']) > 0
        result['detail'] = f"Found {len(result['files'])} API-related files" if result['found'] else "No API client found"
        return result
    
    def _check_api_base_url(self) -> Dict[str, Any]:
        """Check for API base URL configuration"""
        result = {
            'found': False,
            'base_url': None,
            'configurable': False,
            'detail': '',
        }
        
        # Search for API base URL in lib or hooks
        for pattern in ['src/lib/**/*.js*', 'src/hooks/**/*.js*', 'src/lib/**/*.jsx', 'src/hooks/**/*.jsx']:
            for file in self.frontend_path.glob(pattern):
                try:
                    content = file.read_text()
                    if 'REACT_APP_BACKEND_URL' in content or 'baseURL' in content or 'API_BASE_URL' in content:
                        result['found'] = True
                        result['configurable'] = 'process.env' in content or 'REACT_APP' in content
                        if 'http' in content:
                            import re
                            urls = re.findall(r'https?://[^\s"\']+', content)
                            if urls:
                                result['base_url'] = urls[0]
                        result['detail'] = f"Configured in {file.name}"
                        return result
                except:
                    pass
        
        result['detail'] = 'No explicit API base URL configuration found'
        return result
    
    def _check_interceptors(self) -> Dict[str, Any]:
        """Check for request/response interceptors"""
        result = {
            'auth_interceptor': False,
            'error_interceptor': False,
            'detail': '',
        }
        
        for pattern in ['src/lib/**/*.js*', 'src/hooks/**/*.js*']:
            for file in self.frontend_path.glob(pattern):
                try:
                    content = file.read_text()
                    if 'interceptor' in content.lower():
                        result['auth_interceptor'] = result['auth_interceptor'] or 'Authorization' in content or 'token' in content.lower()
                        result['error_interceptor'] = result['error_interceptor'] or 'catch' in content or 'error' in content.lower()
                except:
                    pass
        
        result['detail'] = f"Auth: {'✓' if result['auth_interceptor'] else '✗'}, Errors: {'✓' if result['error_interceptor'] else '✗'}"
        return result

# ============================================================================
# 2. FRONTEND ENVIRONMENT CONFIGURATION
# ============================================================================

class FrontendEnvValidator:
    """Validate frontend environment configuration"""
    
    def __init__(self, frontend_path: str):
        self.frontend_path = Path(frontend_path)
        
    def validate(self) -> Dict[str, Any]:
        """Validate frontend environment"""
        return {
            'env_files': self._check_env_files(),
            'build_config': self._check_build_config(),
            'api_url_env_var': self._check_api_url_env_var(),
        }
    
    def _check_env_files(self) -> Dict[str, Any]:
        """Check for .env files"""
        result = {
            'found_files': [],
            'recommended_missing': [],
        }
        
        # Check for various .env file patterns
        env_patterns = ['.env', '.env.local', '.env.development', '.env.production']
        
        for pattern in env_patterns:
            env_file = self.frontend_path / pattern
            if env_file.exists():
                result['found_files'].append(pattern)
        
        # Recommend which should exist
        if '.env' not in result['found_files']:
            result['recommended_missing'].append('.env (general config)')
        if '.env.production' not in result['found_files']:
            result['recommended_missing'].append('.env.production (prod config)')
        
        return result
    
    def _check_build_config(self) -> Dict[str, Any]:
        """Check build configuration for env var substitution"""
        result = {
            'has_build_script': False,
            'supports_env_vars': False,
            'detail': '',
        }
        
        pkg_file = self.frontend_path / 'package.json'
        if pkg_file.exists():
            try:
                data = json.loads(pkg_file.read_text())
                scripts = data.get('scripts', {})
                result['has_build_script'] = 'build' in scripts
                
                # React Scripts supports REACT_APP_* env vars by default
                result['supports_env_vars'] = 'react-scripts' in str(data.get('dependencies', {})) or \
                                             'react-scripts' in str(data.get('devDependencies', {}))
                result['detail'] = 'React Scripts: REACT_APP_* env vars supported' if result['supports_env_vars'] else 'Unknown build system'
            except:
                pass
        
        return result
    
    def _check_api_url_env_var(self) -> Dict[str, Any]:
        """Check if API URL can be configured via environment"""
        result = {
            'has_backend_url_var': False,
            'env_var_name': None,
            'detail': '',
        }
        
        # Search in lib/hooks for env var usage
        for pattern in ['src/lib/**/*.js*', 'src/hooks/**/*.js*', 'src/**/*.js', 'src/**/*.jsx']:
            for file in self.frontend_path.glob(pattern):
                try:
                    content = file.read_text()
                    if 'REACT_APP_BACKEND_URL' in content:
                        result['has_backend_url_var'] = True
                        result['env_var_name'] = 'REACT_APP_BACKEND_URL'
                        result['detail'] = f"Configured in {file.name}"
                        return result
                except:
                    pass
        
        result['detail'] = 'No REACT_APP_BACKEND_URL env var found'
        return result

# ============================================================================
# 3. BACKEND API CONFIGURATION
# ============================================================================

class BackendApiValidator:
    """Validate backend API configuration for frontend compatibility"""
    
    def __init__(self, backend_path: str):
        self.backend_path = Path(backend_path)
        self.server_file = self.backend_path / 'server.py'
        
    def validate(self) -> Dict[str, Any]:
        """Validate backend API configuration"""
        return {
            'cors_origins': self._check_cors_origins(),
            'api_prefix': self._check_api_prefix(),
            'error_handling': self._check_error_handling(),
            'content_type': self._check_content_type(),
        }
    
    def _check_cors_origins(self) -> Dict[str, Any]:
        """Check CORS allowed origins"""
        result = {
            'configured': False,
            'origins': [],
            'includes_localhost': False,
            'detail': '',
        }
        
        if not self.server_file.exists():
            return result
        
        try:
            content = self.server_file.read_text()
            result['configured'] = 'allow_origins' in content
            
            # Extract origins
            import re
            origin_patterns = [
                r'allow_origins\s*=\s*\[(.*?)\]',
                r'origins\s*=\s*\[(.*?)\]',
            ]
            
            for pattern in origin_patterns:
                matches = re.findall(pattern, content, re.DOTALL)
                if matches:
                    origins_str = matches[0]
                    # Extract URLs
                    origins = re.findall(r'"([^"]+)"', origins_str)
                    result['origins'].extend(origins)
            
            result['includes_localhost'] = any('localhost' in o or '127.0.0.1' in o or '3000' in o for o in result['origins'])
            result['configured'] = len(result['origins']) > 0
            result['detail'] = f"{len(result['origins'])} origins: {', '.join(result['origins'][:2])}"
        except:
            pass
        
        return result
    
    def _check_api_prefix(self) -> Dict[str, Any]:
        """Check API prefix configuration"""
        result = {
            'configured': False,
            'prefix': '/api',
            'detail': '',
        }
        
        if not self.server_file.exists():
            return result
        
        try:
            content = self.server_file.read_text()
            result['configured'] = '/api' in content
            result['detail'] = 'API routes use /api prefix' if result['configured'] else 'Check API route configuration'
        except:
            pass
        
        return result
    
    def _check_error_handling(self) -> Dict[str, Any]:
        """Check error handling for frontend compatibility"""
        result = {
            'has_error_handlers': False,
            'returns_json': False,
            'detail': '',
        }
        
        if not self.server_file.exists():
            return result
        
        try:
            content = self.server_file.read_text()
            result['has_error_handlers'] = '@app.exception_handler' in content or 'HTTPException' in content
            result['returns_json'] = 'JSONResponse' in content or '"error"' in content or "'error'" in content
            result['detail'] = 'Custom error handlers configured' if result['has_error_handlers'] else 'Default error handling'
        except:
            pass
        
        return result
    
    def _check_content_type(self) -> Dict[str, Any]:
        """Check Content-Type headers"""
        result = {
            'json_content_type': False,
            'detail': '',
        }
        
        if not self.server_file.exists():
            return result
        
        try:
            content = self.server_file.read_text()
            result['json_content_type'] = 'application/json' in content or 'JSONResponse' in content
            result['detail'] = 'JSON content type configured' if result['json_content_type'] else 'Check content-type headers'
        except:
            pass
        
        return result

# ============================================================================
# 4. ENDPOINT COMPATIBILITY
# ============================================================================

class EndpointCompatibilityValidator:
    """Validate endpoint compatibility between frontend and backend"""
    
    COMMON_ENDPOINTS = {
        '/api/auth/login': 'Authentication',
        '/api/auth/me': 'Current user',
        '/api/auth/logout': 'Logout',
        '/api/transactions': 'Transactions',
        '/api/budgets': 'Budgets',
        '/api/settings': 'Settings',
    }
    
    def __init__(self, backend_path: str, frontend_path: str):
        self.backend_path = Path(backend_path)
        self.frontend_path = Path(frontend_path)
        self.server_file = self.backend_path / 'server.py'
        
    def validate(self) -> Dict[str, Any]:
        """Validate endpoint compatibility"""
        result = {
            'backend_endpoints': self._check_backend_endpoints(),
            'frontend_usage': self._check_frontend_endpoint_usage(),
            'compatibility': {},
        }
        
        # Check compatibility
        for endpoint in self.COMMON_ENDPOINTS.keys():
            backend_has = endpoint in result['backend_endpoints'].get('found', [])
            frontend_uses = endpoint in result['frontend_usage'].get('used_endpoints', [])
            
            result['compatibility'][endpoint] = {
                'backend_defined': backend_has,
                'frontend_uses': frontend_uses,
                'compatible': backend_has and frontend_uses,
            }
        
        return result
    
    def _check_backend_endpoints(self) -> Dict[str, Any]:
        """Check backend endpoint definitions"""
        result = {'found': [], 'missing': []}
        
        if not self.server_file.exists():
            return result
        
        try:
            content = self.server_file.read_text()
            
            for endpoint, description in self.COMMON_ENDPOINTS.items():
                path = endpoint.replace('/api', '')
                if f"'{path}'" in content or f'"{path}"' in content:
                    result['found'].append(endpoint)
                else:
                    result['missing'].append(endpoint)
        except:
            pass
        
        return result
    
    def _check_frontend_endpoint_usage(self) -> Dict[str, Any]:
        """Check frontend API endpoint usage"""
        result = {'used_endpoints': [], 'unused_endpoints': []}
        
        # Search frontend files for API calls
        used = set()
        for pattern in ['src/**/*.js*']:
            for file in self.frontend_path.glob(pattern):
                try:
                    content = file.read_text()
                    for endpoint in self.COMMON_ENDPOINTS.keys():
                        if endpoint in content or endpoint.replace('/api', '') in content:
                            used.add(endpoint)
                except:
                    pass
        
        result['used_endpoints'] = list(used)
        result['unused_endpoints'] = [e for e in self.COMMON_ENDPOINTS.keys() if e not in used]
        
        return result

# ============================================================================
# 5. MAIN ORCHESTRATOR
# ============================================================================

class IntegrationHealthCheck:
    """Orchestrate integration health checks"""
    
    def __init__(self, root_path: str):
        self.root_path = root_path
        self.backend_path = os.path.join(root_path, 'backend')
        self.frontend_path = os.path.join(root_path, 'frontend')
        self.results = {}
        
    def run(self) -> Dict[str, Any]:
        """Execute all integration checks"""
        print(f"\n{colored('🔗 INTEGRATION & API COMPATIBILITY CHECK', Colors.BLUE)}")
        print(f"   Root: {self.root_path}")
        print("=" * 100)
        
        # 1. Frontend API Client
        print(f"\n{colored('1. FRONTEND API CLIENT', Colors.BLUE)}")
        api_client_validator = ApiClientValidator(self.frontend_path)
        self.results['api_client'] = api_client_validator.validate()
        self._print_api_client_results()
        
        # 2. Frontend Environment
        print(f"\n{colored('2. FRONTEND ENVIRONMENT', Colors.BLUE)}")
        frontend_env_validator = FrontendEnvValidator(self.frontend_path)
        self.results['frontend_env'] = frontend_env_validator.validate()
        self._print_frontend_env_results()
        
        # 3. Backend API Configuration
        print(f"\n{colored('3. BACKEND API CONFIGURATION', Colors.BLUE)}")
        backend_api_validator = BackendApiValidator(self.backend_path)
        self.results['backend_api'] = backend_api_validator.validate()
        self._print_backend_api_results()
        
        # 4. Endpoint Compatibility
        print(f"\n{colored('4. ENDPOINT COMPATIBILITY', Colors.BLUE)}")
        compatibility_validator = EndpointCompatibilityValidator(self.backend_path, self.frontend_path)
        self.results['compatibility'] = compatibility_validator.validate()
        self._print_compatibility_results()
        
        # 5. Summary
        print(f"\n{colored('5. SUMMARY', Colors.BLUE)}")
        self._print_summary()
        
        return self.results
    
    def _print_api_client_results(self):
        """Print API client validation results"""
        client = self.results['api_client']
        
        axios = client['axios_config']
        status = colored('✓', Colors.GREEN) if axios['found'] else colored('⚠', Colors.YELLOW)
        print(f"   Axios Config: {status} {axios['detail']}")
        
        base_url = client['api_base_url']
        status = colored('✓', Colors.GREEN) if base_url['found'] else colored('⚠', Colors.YELLOW)
        print(f"   Base URL: {status} {base_url['detail']}")
        if base_url['base_url']:
            print(f"      URL: {base_url['base_url']}")
        print(f"      Environment Variable: {'✓' if base_url['configurable'] else '✗'}")
        
        interceptors = client['interceptors']
        print(f"   Request Interceptors:")
        print(f"      Auth: {colored('✓', Colors.GREEN) if interceptors['auth_interceptor'] else colored('✗', Colors.RED)}")
        print(f"      Error: {colored('✓', Colors.GREEN) if interceptors['error_interceptor'] else colored('✗', Colors.RED)}")
    
    def _print_frontend_env_results(self):
        """Print frontend environment results"""
        env = self.results['frontend_env']
        
        env_files = env['env_files']
        print(f"   .env Files: {len(env_files['found_files'])} found")
        if env_files['found_files']:
            print(f"      Present: {', '.join(env_files['found_files'])}")
        if env_files['recommended_missing']:
            print(f"      Recommended: {', '.join(env_files['recommended_missing'])}")
        
        build = env['build_config']
        status = colored('✓', Colors.GREEN) if build['supports_env_vars'] else colored('⚠', Colors.YELLOW)
        print(f"   Build Config: {status} {build['detail']}")
        
        api_url = env['api_url_env_var']
        status = colored('✓', Colors.GREEN) if api_url['has_backend_url_var'] else colored('⚠', Colors.YELLOW)
        print(f"   Backend URL Env Var: {status} {api_url['detail']}")
    
    def _print_backend_api_results(self):
        """Print backend API results"""
        backend = self.results['backend_api']
        
        cors = backend['cors_origins']
        status = colored('✓', Colors.GREEN) if cors['configured'] else colored('⚠', Colors.YELLOW)
        print(f"   CORS Configuration: {status} {cors['detail']}")
        
        prefix = backend['api_prefix']
        status = colored('✓', Colors.GREEN) if prefix['configured'] else colored('⚠', Colors.YELLOW)
        print(f"   API Prefix: {status} {prefix['detail']}")
        
        errors = backend['error_handling']
        status = colored('✓', Colors.GREEN) if errors['has_error_handlers'] else colored('⚠', Colors.YELLOW)
        print(f"   Error Handling: {status} {errors['detail']}")
        
        ct = backend['content_type']
        status = colored('✓', Colors.GREEN) if ct['json_content_type'] else colored('⚠', Colors.YELLOW)
        print(f"   JSON Content-Type: {status} {ct['detail']}")
    
    def _print_compatibility_results(self):
        """Print endpoint compatibility results"""
        compat = self.results['compatibility']
        
        backend_eps = compat['backend_endpoints']
        print(f"   Backend Endpoints: {len(backend_eps['found'])}/{len(backend_eps['found']) + len(backend_eps['missing'])} defined")
        
        frontend_eps = compat['frontend_usage']
        print(f"   Frontend Endpoints: {len(frontend_eps['used_endpoints'])}/{len(frontend_eps['used_endpoints']) + len(frontend_eps['unused_endpoints'])} used")
        
        compatible_count = sum(1 for ep in compat['compatibility'].values() if ep['compatible'])
        total_count = len(compat['compatibility'])
        status = colored('✓', Colors.GREEN) if compatible_count == total_count else colored('⚠', Colors.YELLOW)
        print(f"   Compatible Endpoints: {status} {compatible_count}/{total_count}")
    
    def _print_summary(self):
        """Print summary"""
        client_ok = self.results['api_client']['api_base_url']['found']
        backend_ok = self.results['backend_api']['cors_origins']['configured']
        compat_ok = self.results['compatibility']['backend_endpoints']['found']
        
        all_ok = client_ok and backend_ok and len(compat_ok) > 0
        
        status = colored('✅ READY', Colors.GREEN) if all_ok else colored('⚠️  NEEDS ATTENTION', Colors.YELLOW)
        print(f"   Integration Status: {status}")

# ============================================================================
# ENTRY POINT
# ============================================================================

def main():
    """Main entry point"""
    root_path = os.path.dirname(os.path.abspath(__file__))
    health_check = IntegrationHealthCheck(root_path)
    results = health_check.run()
    return results

if __name__ == '__main__':
    main()
