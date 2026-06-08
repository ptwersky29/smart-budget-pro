"""
Enhanced Backend Health Check - Validates database, environment, dependencies, and API endpoints
"""
import os
import sys
import json
import asyncio
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple, Any

# Color codes for console output
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def colored(text: str, color: str) -> str:
    """Colorize console output"""
    if sys.platform == "win32":
        return text  # Skip colors on Windows
    return f"{color}{text}{Colors.END}"

# ============================================================================
# 1. ENVIRONMENT & CONFIGURATION VALIDATION
# ============================================================================

class EnvironmentValidator:
    """Validate environment configuration"""
    
    REQUIRED_ENV_VARS = [
        'DATABASE_URL',
        'JWT_SECRET',
        'FRONTEND_URL',
    ]
    
    OPTIONAL_ENV_VARS = [
        'OPENROUTER_API_KEY',
        'STRIPE_SECRET_KEY',
        'TRUELAYER_CLIENT_ID',
        'TRUELAYER_CLIENT_SECRET',
        'ADMIN_EMAIL',
        'ADMIN_PASSWORD',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
    ]
    
    def __init__(self, backend_path: str):
        self.backend_path = backend_path
        self.env_file = Path(backend_path) / '.env'
        self.results = {}
        
    def validate(self) -> Dict[str, Any]:
        """Run all environment validations"""
        results = {
            'required_vars': self._check_required_vars(),
            'optional_vars': self._check_optional_vars(),
            'env_file': self._check_env_file(),
            'jwt_secret': self._check_jwt_secret(),
            'database_url': self._check_database_url(),
        }
        return results
    
    def _check_required_vars(self) -> Dict[str, Any]:
        """Check if all required environment variables are set"""
        result = {'passed': True, 'missing': [], 'present': []}
        for var in self.REQUIRED_ENV_VARS:
            if not os.getenv(var):
                result['missing'].append(var)
                result['passed'] = False
            else:
                result['present'].append(var)
        return result
    
    def _check_optional_vars(self) -> Dict[str, Any]:
        """Check optional environment variables"""
        result = {'present': [], 'missing': []}
        for var in self.OPTIONAL_ENV_VARS:
            if os.getenv(var):
                result['present'].append(var)
            else:
                result['missing'].append(var)
        return result
    
    def _check_env_file(self) -> Dict[str, Any]:
        """Check if .env file exists and is readable"""
        result = {
            'passed': False,
            'exists': self.env_file.exists(),
            'readable': False,
            'lines': 0,
            'detail': ''
        }
        
        if result['exists']:
            try:
                with open(self.env_file, 'r') as f:
                    lines = [line.strip() for line in f.readlines() if line.strip() and not line.strip().startswith('#')]
                    result['lines'] = len(lines)
                    result['readable'] = True
                    result['passed'] = result['lines'] > 0
                    result['detail'] = f"File has {result['lines']} configuration lines"
            except Exception as e:
                result['detail'] = str(e)
        else:
            result['detail'] = "No .env file found in backend directory"
        
        return result
    
    def _check_jwt_secret(self) -> Dict[str, Any]:
        """Validate JWT_SECRET is configured"""
        jwt_secret = os.getenv('JWT_SECRET')
        result = {
            'passed': False,
            'exists': bool(jwt_secret),
            'length': 0,
            'detail': ''
        }
        
        if jwt_secret:
            result['length'] = len(jwt_secret)
            result['passed'] = result['length'] >= 32
            result['detail'] = f"JWT_SECRET length: {result['length']} chars"
            if not result['passed']:
                result['detail'] += " (⚠️ Recommended: ≥32 chars for security)"
        else:
            result['detail'] = "JWT_SECRET not set"
        
        return result
    
    def _check_database_url(self) -> Dict[str, Any]:
        """Validate DATABASE_URL format"""
        db_url = os.getenv('DATABASE_URL', '')
        result = {
            'passed': False,
            'exists': bool(db_url),
            'valid_format': False,
            'detail': ''
        }
        
        if db_url:
            result['valid_format'] = db_url.startswith('postgresql://') or db_url.startswith('postgres://')
            result['passed'] = result['valid_format']
            if result['valid_format']:
                # Mask password in display
                masked_url = db_url.split('@')[0] + '@***:***@' + db_url.split('@')[1] if '@' in db_url else db_url[:30] + '...'
                result['detail'] = f"PostgreSQL URL configured: {masked_url}"
            else:
                result['detail'] = f"Invalid format. Expected: postgresql://user:pass@host:port/db"
        else:
            result['detail'] = "DATABASE_URL not set"
        
        return result

# ============================================================================
# 2. DEPENDENCY VALIDATION
# ============================================================================

class DependencyValidator:
    """Validate Python dependencies"""
    
    def __init__(self, backend_path: str):
        self.backend_path = backend_path
        self.requirements_file = Path(backend_path) / 'requirements.txt'
        
    def validate(self) -> Dict[str, Any]:
        """Run dependency validations"""
        result = {
            'requirements_file': self._check_requirements_file(),
            'critical_packages': self._check_critical_packages(),
            'import_check': self._check_imports(),
        }
        return result
    
    def _check_requirements_file(self) -> Dict[str, Any]:
        """Validate requirements.txt exists and is readable"""
        result = {
            'passed': False,
            'exists': self.requirements_file.exists(),
            'lines': 0,
            'packages': [],
            'detail': ''
        }
        
        if result['exists']:
            try:
                with open(self.requirements_file, 'r') as f:
                    lines = [line.strip() for line in f.readlines() if line.strip() and not line.strip().startswith('#')]
                    result['packages'] = lines
                    result['lines'] = len(lines)
                    result['passed'] = result['lines'] > 0
                    result['detail'] = f"{result['lines']} packages listed"
            except Exception as e:
                result['detail'] = str(e)
        else:
            result['detail'] = "requirements.txt not found"
        
        return result
    
    def _check_critical_packages(self) -> Dict[str, Any]:
        """Check if critical packages are installed"""
        critical = ['fastapi', 'uvicorn', 'sqlalchemy', 'pydantic', 'asyncpg', 'bcrypt']
        result = {
            'passed': True,
            'installed': [],
            'missing': [],
            'detail': ''
        }
        
        for package in critical:
            try:
                __import__(package)
                result['installed'].append(package)
            except ImportError:
                result['missing'].append(package)
                result['passed'] = False
        
        result['detail'] = f"Installed: {len(result['installed'])}/{len(critical)}"
        return result
    
    def _check_imports(self) -> Dict[str, Any]:
        """Check if backend modules can be imported"""
        result = {
            'passed': True,
            'modules': {},
            'detail': ''
        }
        
        # Add backend path to sys.path temporarily
        backend_path = str(self.backend_path)
        if backend_path not in sys.path:
            sys.path.insert(0, backend_path)
        
        core_modules = ['db', 'auth', 'server', 'budget_system', 'jewish']
        
        for module_name in core_modules:
            try:
                __import__(module_name)
                result['modules'][module_name] = {'passed': True, 'error': None}
            except Exception as e:
                result['modules'][module_name] = {'passed': False, 'error': str(e)[:100]}
                result['passed'] = False
        
        result['detail'] = f"Imported {len([m for m in result['modules'].values() if m['passed']])}/{len(core_modules)} core modules"
        return result

# ============================================================================
# 3. DATABASE CONNECTIVITY CHECK
# ============================================================================

class DatabaseValidator:
    """Validate database connectivity and schema"""
    
    def __init__(self):
        self.db_url = os.getenv('DATABASE_URL')
        
    async def validate(self) -> Dict[str, Any]:
        """Run database validations"""
        result = {
            'configured': bool(self.db_url),
            'connection': await self._test_connection(),
            'tables': await self._check_tables() if self.db_url else None,
        }
        return result
    
    async def _test_connection(self) -> Dict[str, Any]:
        """Test PostgreSQL connection"""
        result = {
            'passed': False,
            'connected': False,
            'error': None,
            'detail': 'Not attempted - no DATABASE_URL'
        }
        
        if not self.db_url:
            return result
        
        try:
            import asyncpg
            try:
                # Parse connection string
                conn = await asyncpg.connect(self.db_url, command_timeout=10)
                version = await conn.fetchval('SELECT version()')
                await conn.close()
                
                result['passed'] = True
                result['connected'] = True
                result['detail'] = f"PostgreSQL connected successfully"
                return result
            except Exception as e:
                result['error'] = str(e)[:100]
                result['detail'] = f"Connection failed: {result['error']}"
                return result
        except ImportError:
            result['error'] = "asyncpg not installed"
            result['detail'] = "Cannot test connection - asyncpg not available"
            return result
    
    async def _check_tables(self) -> Dict[str, Any]:
        """Check if expected tables exist"""
        result = {
            'passed': False,
            'tables': [],
            'missing': [],
            'error': None,
        }
        
        if not self.db_url:
            return result
        
        try:
            import asyncpg
            try:
                conn = await asyncpg.connect(self.db_url, command_timeout=10)
                
                # Query information schema
                tables = await conn.fetch("""
                    SELECT table_name FROM information_schema.tables 
                    WHERE table_schema = 'public'
                """)
                
                result['tables'] = [t['table_name'] for t in tables]
                result['passed'] = len(result['tables']) > 0
                
                await conn.close()
            except Exception as e:
                result['error'] = str(e)[:100]
        except ImportError:
            result['error'] = "asyncpg not installed"
        
        return result

# ============================================================================
# 4. FILE STRUCTURE CHECK
# ============================================================================

class FileStructureValidator:
    """Validate backend file structure"""
    
    REQUIRED_FILES = [
        'server.py',
        'db.py',
        'auth.py',
        'requirements.txt',
    ]
    
    REQUIRED_DIRS = [
        'tests',
    ]
    
    def __init__(self, backend_path: str):
        self.backend_path = Path(backend_path)
        
    def validate(self) -> Dict[str, Any]:
        """Run file structure validations"""
        result = {
            'required_files': self._check_required_files(),
            'required_dirs': self._check_required_dirs(),
        }
        return result
    
    def _check_required_files(self) -> Dict[str, Any]:
        """Check if required files exist"""
        result = {
            'passed': True,
            'present': [],
            'missing': []
        }
        
        for filename in self.REQUIRED_FILES:
            filepath = self.backend_path / filename
            if filepath.exists():
                result['present'].append(filename)
            else:
                result['missing'].append(filename)
                result['passed'] = False
        
        return result
    
    def _check_required_dirs(self) -> Dict[str, Any]:
        """Check if required directories exist"""
        result = {
            'passed': True,
            'present': [],
            'missing': []
        }
        
        for dirname in self.REQUIRED_DIRS:
            dirpath = self.backend_path / dirname
            if dirpath.exists() and dirpath.is_dir():
                result['present'].append(dirname)
            else:
                result['missing'].append(dirname)
                result['passed'] = False
        
        return result

# ============================================================================
# 5. MAIN HEALTH CHECK ORCHESTRATOR
# ============================================================================

class BackendHealthCheck:
    """Orchestrate all backend health checks"""
    
    def __init__(self, backend_path: str):
        self.backend_path = backend_path
        self.timestamp = datetime.now().isoformat()
        self.results = {}
        
    async def run(self) -> Dict[str, Any]:
        """Execute all health checks"""
        print(f"\n{colored('🔧 BACKEND HEALTH CHECK', Colors.BLUE)}")
        print(f"   Path: {self.backend_path}")
        print(f"   Time: {self.timestamp}")
        print("=" * 100)
        
        # 1. Environment
        print(f"\n{colored('1. ENVIRONMENT CONFIGURATION', Colors.BLUE)}")
        env_validator = EnvironmentValidator(self.backend_path)
        self.results['environment'] = env_validator.validate()
        self._print_env_results()
        
        # 2. File Structure
        print(f"\n{colored('2. FILE STRUCTURE', Colors.BLUE)}")
        file_validator = FileStructureValidator(self.backend_path)
        self.results['file_structure'] = file_validator.validate()
        self._print_file_structure_results()
        
        # 3. Dependencies
        print(f"\n{colored('3. DEPENDENCIES', Colors.BLUE)}")
        dep_validator = DependencyValidator(self.backend_path)
        self.results['dependencies'] = dep_validator.validate()
        self._print_dependency_results()
        
        # 4. Database
        print(f"\n{colored('4. DATABASE CONNECTIVITY', Colors.BLUE)}")
        db_validator = DatabaseValidator()
        self.results['database'] = await db_validator.validate()
        self._print_database_results()
        
        # 5. Summary
        print(f"\n{colored('5. SUMMARY', Colors.BLUE)}")
        self._print_summary()
        
        return self.results
    
    def _print_env_results(self):
        """Print environment validation results"""
        env = self.results['environment']
        
        required = env['required_vars']
        print(f"   Required Vars: {colored('✓', Colors.GREEN) if required['passed'] else colored('✗', Colors.RED)} "
              f"({len(required['present'])}/{len(required['present']) + len(required['missing'])} present)")
        if required['missing']:
            print(f"      {colored('Missing:', Colors.RED)} {', '.join(required['missing'])}")
        
        optional = env['optional_vars']
        print(f"   Optional Vars: {len(optional['present'])} configured")
        
        env_file = env['env_file']
        print(f"   .env File: {colored('✓', Colors.GREEN) if env_file['passed'] else colored('⚠', Colors.YELLOW)} {env_file['detail']}")
        
        jwt = env['jwt_secret']
        status = colored('✓', Colors.GREEN) if jwt['passed'] else colored('⚠', Colors.YELLOW)
        print(f"   JWT Secret: {status} {jwt['detail']}")
        
        db_url = env['database_url']
        status = colored('✓', Colors.GREEN) if db_url['passed'] else colored('✗', Colors.RED)
        print(f"   Database URL: {status} {db_url['detail']}")
    
    def _print_file_structure_results(self):
        """Print file structure validation results"""
        fs = self.results['file_structure']
        
        files = fs['required_files']
        print(f"   Required Files: {colored('✓', Colors.GREEN) if files['passed'] else colored('✗', Colors.RED)} "
              f"({len(files['present'])}/{len(files['present']) + len(files['missing'])} found)")
        if files['missing']:
            print(f"      {colored('Missing:', Colors.RED)} {', '.join(files['missing'])}")
        
        dirs = fs['required_dirs']
        print(f"   Required Dirs: {colored('✓', Colors.GREEN) if dirs['passed'] else colored('✗', Colors.RED)} "
              f"({len(dirs['present'])}/{len(dirs['present']) + len(dirs['missing'])} found)")
        if dirs['missing']:
            print(f"      {colored('Missing:', Colors.RED)} {', '.join(dirs['missing'])}")
    
    def _print_dependency_results(self):
        """Print dependency validation results"""
        deps = self.results['dependencies']
        
        req = deps['requirements_file']
        print(f"   requirements.txt: {colored('✓', Colors.GREEN) if req['passed'] else colored('✗', Colors.RED)} {req['detail']}")
        
        critical = deps['critical_packages']
        status = colored('✓', Colors.GREEN) if critical['passed'] else colored('✗', Colors.RED)
        print(f"   Critical Packages: {status} {critical['detail']}")
        if critical['missing']:
            print(f"      {colored('Missing:', Colors.RED)} {', '.join(critical['missing'])}")
        
        imports = deps['import_check']
        status = colored('✓', Colors.GREEN) if imports['passed'] else colored('✗', Colors.RED)
        print(f"   Module Imports: {status} {imports['detail']}")
        for mod, info in imports['modules'].items():
            if not info['passed']:
                print(f"      {colored('✗', Colors.RED)} {mod}: {info['error']}")
    
    def _print_database_results(self):
        """Print database validation results"""
        db = self.results['database']
        
        if not db['configured']:
            print(f"   {colored('⚠', Colors.YELLOW)} No DATABASE_URL configured")
            return
        
        conn = db['connection']
        status = colored('✓', Colors.GREEN) if conn['passed'] else colored('✗', Colors.RED)
        print(f"   Connection: {status} {conn['detail']}")
        
        if db['tables']:
            tables = db['tables']
            status = colored('✓', Colors.GREEN) if tables['passed'] else colored('⚠', Colors.YELLOW)
            print(f"   Tables: {status} {len(tables['tables'])} tables found")
    
    def _print_summary(self):
        """Print overall health check summary"""
        all_passed = all([
            self.results['environment']['required_vars']['passed'],
            self.results['file_structure']['required_files']['passed'],
            self.results['dependencies']['critical_packages']['passed'],
        ])
        
        status = colored('✅ READY', Colors.GREEN) if all_passed else colored('⚠️  NEEDS ATTENTION', Colors.YELLOW)
        print(f"   Backend Status: {status}")

# ============================================================================
# ENTRY POINT
# ============================================================================

async def main():
    """Main entry point"""
    backend_path = os.path.dirname(os.path.abspath(__file__))
    
    # Load environment
    env_file = Path(backend_path) / '.env'
    if env_file.exists():
        from dotenv import load_dotenv
        load_dotenv(env_file)
    
    # Run health check
    health_check = BackendHealthCheck(backend_path)
    results = await health_check.run()
    
    return results

if __name__ == '__main__':
    asyncio.run(main())
