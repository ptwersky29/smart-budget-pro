"""
Infrastructure & Deployment Health Check - Validates config files, environment, and deployment readiness
"""
import json
import os
import sys
import re
from pathlib import Path
from typing import Dict, List, Any
from urllib.parse import urlparse

# Optional yaml import
try:
    import yaml
except ImportError:
    yaml = None

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
# 1. RENDER DEPLOYMENT VALIDATOR
# ============================================================================

class RenderDeploymentValidator:
    """Validate Render deployment configuration"""
    
    def __init__(self, root_path: str):
        self.root_path = Path(root_path)
        self.render_file = self.root_path / 'render.yaml'
        
    def validate(self) -> Dict[str, Any]:
        """Validate render.yaml configuration"""
        result = {
            'file_exists': self.render_file.exists(),
            'valid_yaml': False,
            'config': None,
            'services': [],
            'environment_vars': [],
            'health_check': None,
        }
        
        if not result['file_exists']:
            return result
        
        if yaml is None:
            result['detail'] = 'pyyaml not installed - skipping validation'
            return result
        
        try:
            with open(self.render_file, 'r') as f:
                result['config'] = yaml.safe_load(f)
            result['valid_yaml'] = result['config'] is not None
            
            if result['valid_yaml']:
                result['services'] = self._extract_services()
                result['environment_vars'] = self._extract_env_vars()
                result['health_check'] = self._check_health_endpoint()
        except Exception as e:
            result['error'] = str(e)
        
        return result
    
    def _extract_services(self) -> List[Dict[str, Any]]:
        """Extract service configurations"""
        services = []
        if isinstance(self.render_file, dict):
            # render.yaml can be list or dict
            pass
        return services
    
    def _extract_env_vars(self) -> List[str]:
        """Extract environment variables from render.yaml"""
        env_vars = []
        try:
            if self.render_file and isinstance(self.render_file, dict):
                # Simplified extraction - look for 'env' keys
                config_str = str(self.render_file)
                # Find all lines with env var references
                matches = re.findall(r'\$\{(\w+)\}', config_str)
                env_vars = list(set(matches))
        except:
            pass
        return env_vars
    
    def _check_health_endpoint(self) -> Dict[str, Any]:
        """Check if health endpoint is configured"""
        result = {
            'configured': False,
            'endpoint': None,
        }
        try:
            config_str = str(self.render_file)
            if '/api/health' in config_str or 'health' in config_str:
                result['configured'] = True
                result['endpoint'] = '/api/health'
        except:
            pass
        return result

# ============================================================================
# 2. PROCFILE VALIDATOR
# ============================================================================

class ProcfileValidator:
    """Validate Procfile configuration"""
    
    def __init__(self, backend_path: str):
        self.backend_path = Path(backend_path)
        self.procfile = self.backend_path / 'Procfile'
        
    def validate(self) -> Dict[str, Any]:
        """Validate Procfile"""
        result = {
            'file_exists': self.procfile.exists(),
            'valid': False,
            'content': None,
            'has_web_process': False,
            'uses_uvicorn': False,
            'detail': '',
        }
        
        if not result['file_exists']:
            result['detail'] = 'Procfile not found in backend/'
            return result
        
        try:
            result['content'] = self.procfile.read_text().strip()
            result['valid'] = bool(result['content'])
            result['has_web_process'] = 'web:' in result['content']
            result['uses_uvicorn'] = 'uvicorn' in result['content']
            
            if result['valid'] and result['has_web_process'] and result['uses_uvicorn']:
                result['detail'] = 'Valid FastAPI/Uvicorn Procfile'
            elif result['valid']:
                result['detail'] = f"Procfile valid but may need review: {result['content'][:50]}"
            else:
                result['detail'] = 'Procfile is empty'
        except Exception as e:
            result['detail'] = str(e)
        
        return result

# ============================================================================
# 3. ENVIRONMENT VARIABLES VALIDATOR
# ============================================================================

class EnvironmentVariablesValidator:
    """Validate environment variable configuration"""
    
    CRITICAL_VARS = {
        'DATABASE_URL': 'PostgreSQL connection string',
        'JWT_SECRET': 'JWT secret key for authentication',
        'FRONTEND_URL': 'Frontend application URL',
    }
    
    DEPLOYMENT_VARS = {
        'NODE_ENV': 'Environment (production/development)',
        'DEBUG': 'Debug mode flag',
        'LOG_LEVEL': 'Logging level',
    }
    
    INTEGRATION_VARS = {
        'OPENROUTER_API_KEY': 'AI API key',
        'STRIPE_SECRET_KEY': 'Stripe payment key',
        'TRUELAYER_CLIENT_ID': 'Bank sync integration',
    }
    
    def __init__(self, backend_path: str):
        self.backend_path = Path(backend_path)
        self.env_file = self.backend_path / '.env'
        self.env_data = {}
        
    def validate(self) -> Dict[str, Any]:
        """Validate environment variables"""
        self._load_env_file()
        
        return {
            'env_file_exists': self.env_file.exists(),
            'critical_vars': self._check_vars(self.CRITICAL_VARS),
            'deployment_vars': self._check_vars(self.DEPLOYMENT_VARS),
            'integration_vars': self._check_vars(self.INTEGRATION_VARS),
            'env_specific': self._check_env_specific(),
        }
    
    def _load_env_file(self):
        """Load .env file"""
        if self.env_file.exists():
            try:
                with open(self.env_file, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#') and '=' in line:
                            key, val = line.split('=', 1)
                            self.env_data[key.strip()] = val.strip()
            except:
                pass
        
        # Also load from OS environment
        for key in list(self.CRITICAL_VARS.keys()) + list(self.DEPLOYMENT_VARS.keys()) + list(self.INTEGRATION_VARS.keys()):
            if key not in self.env_data:
                os_val = os.getenv(key)
                if os_val:
                    self.env_data[key] = os_val
    
    def _check_vars(self, vars_dict: Dict[str, str]) -> Dict[str, Any]:
        """Check set of variables"""
        result = {'present': [], 'missing': [], 'empty': []}
        
        for var, description in vars_dict.items():
            if var in self.env_data:
                val = self.env_data[var]
                if val:
                    result['present'].append({
                        'name': var,
                        'description': description,
                        'value_sample': val[:20] + '...' if len(val) > 20 else val,
                    })
                else:
                    result['empty'].append(var)
            else:
                result['missing'].append({
                    'name': var,
                    'description': description,
                })
        
        return result
    
    def _check_env_specific(self) -> Dict[str, Any]:
        """Check environment-specific configurations"""
        result = {
            'node_env': os.getenv('NODE_ENV') or self.env_data.get('NODE_ENV', 'not set'),
            'debug_mode': bool(os.getenv('DEBUG') or self.env_data.get('DEBUG', '')),
            'recommendation': 'Set NODE_ENV=production for production deployments',
        }
        return result

# ============================================================================
# 4. CORS & SECURITY VALIDATOR
# ============================================================================

class CorsSecurityValidator:
    """Validate CORS and security configuration"""
    
    def __init__(self, backend_path: str):
        self.backend_path = Path(backend_path)
        self.server_file = self.backend_path / 'server.py'
        
    def validate(self) -> Dict[str, Any]:
        """Validate CORS and security settings"""
        return {
            'cors_configured': self._check_cors_config(),
            'security_headers': self._check_security_headers(),
            'https_redirect': self._check_https_redirect(),
            'csrf_protection': self._check_csrf_protection(),
        }
    
    def _check_cors_config(self) -> Dict[str, Any]:
        """Check CORS configuration in server.py"""
        result = {
            'found': False,
            'origins': [],
            'detail': '',
        }
        
        if not self.server_file.exists():
            result['detail'] = 'server.py not found'
            return result
        
        try:
            content = self.server_file.read_text()
            result['found'] = 'CORSMiddleware' in content or 'cors' in content.lower()
            
            if result['found']:
                # Look for allowed origins
                origin_matches = re.findall(r'allow_origins\s*=\s*\[(.*?)\]', content, re.DOTALL)
                if origin_matches:
                    origins_str = origin_matches[0]
                    origins = re.findall(r'"([^"]+)"', origins_str)
                    result['origins'] = origins
                
                result['detail'] = f"CORS configured with {len(result['origins'])} origin(s)"
            else:
                result['detail'] = 'CORS middleware not detected'
        except Exception as e:
            result['detail'] = str(e)
        
        return result
    
    def _check_security_headers(self) -> Dict[str, Any]:
        """Check for security headers"""
        result = {
            'found': False,
            'headers': [],
            'detail': '',
        }
        
        if not self.server_file.exists():
            return result
        
        try:
            content = self.server_file.read_text()
            security_keywords = ['X-Content-Type-Options', 'X-Frame-Options', 'Strict-Transport-Security', 'X-XSS-Protection']
            found_headers = [h for h in security_keywords if h in content]
            result['found'] = len(found_headers) > 0
            result['headers'] = found_headers
            result['detail'] = f"{len(found_headers)} security headers configured"
        except:
            pass
        
        return result
    
    def _check_https_redirect(self) -> Dict[str, Any]:
        """Check for HTTPS redirect"""
        result = {
            'configured': False,
            'detail': '',
        }
        
        if not self.server_file.exists():
            return result
        
        try:
            content = self.server_file.read_text()
            result['configured'] = 'https' in content.lower() or 'scheme' in content.lower()
            result['detail'] = 'HTTPS redirect configured' if result['configured'] else 'Not configured'
        except:
            pass
        
        return result
    
    def _check_csrf_protection(self) -> Dict[str, Any]:
        """Check for CSRF protection"""
        result = {
            'configured': False,
            'detail': '',
        }
        
        if not self.server_file.exists():
            return result
        
        try:
            content = self.server_file.read_text()
            result['configured'] = 'csrf' in content.lower() or 'CSRFProtectionMiddleware' in content
            result['detail'] = 'CSRF protection enabled' if result['configured'] else 'Not configured'
        except:
            pass
        
        return result

# ============================================================================
# 5. API ENDPOINT VALIDATOR
# ============================================================================

class ApiEndpointValidator:
    """Validate critical API endpoints are defined"""
    
    CRITICAL_ENDPOINTS = {
        'GET /api/health': 'Health check endpoint',
        'POST /api/auth/login': 'Login endpoint',
        'GET /api/transactions': 'List transactions',
        'POST /api/budgets': 'Create budget',
        'GET /api/settings': 'Get settings',
    }
    
    def __init__(self, backend_path: str):
        self.backend_path = Path(backend_path)
        self.server_file = self.backend_path / 'server.py'
        
    def validate(self) -> Dict[str, Any]:
        """Validate API endpoints"""
        result = {
            'found': [],
            'missing': [],
            'detail': '',
        }
        
        if not self.server_file.exists():
            result['detail'] = 'server.py not found'
            return result
        
        try:
            content = self.server_file.read_text()
            
            for endpoint, description in self.CRITICAL_ENDPOINTS.items():
                method, path = endpoint.split(' ')
                # Simple check: look for @app.<method> and path pattern
                pattern = f'@app\\.{method.lower()}.*{path.replace("/", r"\\/")}' if method != 'GET' else f"'{path}'" if path in content else False
                
                # More flexible check
                if f"'{path}'" in content or f'"{path}"' in content:
                    result['found'].append({'endpoint': endpoint, 'description': description})
                else:
                    result['missing'].append({'endpoint': endpoint, 'description': description})
        except:
            pass
        
        result['detail'] = f"{len(result['found'])}/{len(self.CRITICAL_ENDPOINTS)} endpoints found"
        return result

# ============================================================================
# 6. MAIN ORCHESTRATOR
# ============================================================================

class InfrastructureHealthCheck:
    """Orchestrate infrastructure health checks"""
    
    def __init__(self, root_path: str):
        self.root_path = root_path
        self.results = {}
        
    def run(self) -> Dict[str, Any]:
        """Execute all infrastructure checks"""
        print(f"\n{colored('🚀 INFRASTRUCTURE & DEPLOYMENT CHECK', Colors.BLUE)}")
        print(f"   Path: {self.root_path}")
        print("=" * 100)
        
        # 1. Render Deployment
        print(f"\n{colored('1. RENDER DEPLOYMENT CONFIGURATION', Colors.BLUE)}")
        render_validator = RenderDeploymentValidator(self.root_path)
        self.results['render'] = render_validator.validate()
        self._print_render_results()
        
        # 2. Procfile
        print(f"\n{colored('2. PROCFILE CONFIGURATION', Colors.BLUE)}")
        procfile_validator = ProcfileValidator(os.path.join(self.root_path, 'backend'))
        self.results['procfile'] = procfile_validator.validate()
        self._print_procfile_results()
        
        # 3. Environment Variables
        print(f"\n{colored('3. ENVIRONMENT VARIABLES', Colors.BLUE)}")
        env_validator = EnvironmentVariablesValidator(os.path.join(self.root_path, 'backend'))
        self.results['environment'] = env_validator.validate()
        self._print_environment_results()
        
        # 4. CORS & Security
        print(f"\n{colored('4. CORS & SECURITY', Colors.BLUE)}")
        cors_validator = CorsSecurityValidator(os.path.join(self.root_path, 'backend'))
        self.results['security'] = cors_validator.validate()
        self._print_security_results()
        
        # 5. API Endpoints
        print(f"\n{colored('5. API ENDPOINTS', Colors.BLUE)}")
        api_validator = ApiEndpointValidator(os.path.join(self.root_path, 'backend'))
        self.results['api'] = api_validator.validate()
        self._print_api_results()
        
        # 6. Summary
        print(f"\n{colored('6. SUMMARY', Colors.BLUE)}")
        self._print_summary()
        
        return self.results
    
    def _print_render_results(self):
        """Print Render deployment results"""
        render = self.results['render']
        
        status = colored('✓', Colors.GREEN) if render['valid_yaml'] else colored('✗', Colors.RED)
        print(f"   render.yaml: {status} {'Valid configuration' if render['valid_yaml'] else 'Not found or invalid'}")
        
        if render.get('error'):
            print(f"      {colored('Error:', Colors.RED)} {render['error']}")
    
    def _print_procfile_results(self):
        """Print Procfile results"""
        pf = self.results['procfile']
        
        status = colored('✓', Colors.GREEN) if pf['valid'] else colored('✗', Colors.RED)
        print(f"   Procfile: {status} {pf['detail']}")
        if pf['content']:
            print(f"      Command: {pf['content']}")
    
    def _print_environment_results(self):
        """Print environment variables results"""
        env = self.results['environment']
        
        critical = env['critical_vars']
        status = colored('✓', Colors.GREEN) if not critical['missing'] else colored('✗', Colors.RED)
        print(f"   Critical Vars: {status} ({len(critical['present'])}/{len(critical['present']) + len(critical['missing'])} present)")
        if critical['missing']:
            missing_names = [m['name'] for m in critical['missing']]
            print(f"      {colored('Missing:', Colors.RED)} {', '.join(missing_names)}")
        
        deployment = env['deployment_vars']
        print(f"   Deployment Vars: {len(deployment['present'])} configured")
        
        integration = env['integration_vars']
        print(f"   Integration APIs: {len(integration['present'])} configured (optional)")
        
        env_specific = env['env_specific']
        print(f"   NODE_ENV: {env_specific['node_env']}")
    
    def _print_security_results(self):
        """Print security results"""
        sec = self.results['security']
        
        cors = sec['cors_configured']
        status = colored('✓', Colors.GREEN) if cors['found'] else colored('⚠', Colors.YELLOW)
        print(f"   CORS: {status} {cors['detail']}")
        
        sh = sec['security_headers']
        status = colored('✓', Colors.GREEN) if sh['found'] else colored('⚠', Colors.YELLOW)
        print(f"   Security Headers: {status} {sh['detail']}")
        
        https = sec['https_redirect']
        status = colored('✓', Colors.GREEN) if https['configured'] else colored('⚠', Colors.YELLOW)
        print(f"   HTTPS Config: {status} {https['detail']}")
        
        csrf = sec['csrf_protection']
        status = colored('✓', Colors.GREEN) if csrf['configured'] else colored('⚠', Colors.YELLOW)
        print(f"   CSRF Protection: {status} {csrf['detail']}")
    
    def _print_api_results(self):
        """Print API endpoint results"""
        api = self.results['api']
        
        total = len(api['found']) + len(api['missing'])
        status = colored('✓', Colors.GREEN) if not api['missing'] else colored('⚠', Colors.YELLOW)
        print(f"   Critical Endpoints: {status} {api['detail']}")
    
    def _print_summary(self):
        """Print summary"""
        env_critical = self.results['environment']['critical_vars']
        all_ok = not env_critical['missing'] and self.results['procfile']['valid']
        
        status = colored('✅ READY', Colors.GREEN) if all_ok else colored('⚠️  NEEDS ATTENTION', Colors.YELLOW)
        print(f"   Infrastructure Status: {status}")

# ============================================================================
# ENTRY POINT
# ============================================================================

def main():
    """Main entry point"""
    root_path = os.path.dirname(os.path.abspath(__file__))
    
    # Load environment from .env file if exists
    env_file = Path(root_path) / 'backend' / '.env'
    if env_file.exists():
        try:
            from dotenv import load_dotenv
            load_dotenv(env_file)
        except:
            pass
    
    health_check = InfrastructureHealthCheck(root_path)
    results = health_check.run()
    return results

if __name__ == '__main__':
    main()
