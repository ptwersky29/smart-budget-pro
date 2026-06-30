"""
Frontend Health Check - Validates React app setup, dependencies, and configuration
"""
import json
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Any
import re

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

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
# 1. PACKAGE.JSON VALIDATION
# ============================================================================

class PackageJsonValidator:
    """Validate package.json configuration"""
    
    REQUIRED_SCRIPTS = [
        'start',
        'build',
        'test',
    ]
    
    CRITICAL_DEPENDENCIES = [
        'react',
        'react-dom',
        'react-router-dom',
        'axios',
        'tailwindcss',
    ]
    
    def __init__(self, frontend_path: str):
        self.frontend_path = Path(frontend_path)
        self.package_file = self.frontend_path / 'package.json'
        self.package_data = None
        
    def validate(self) -> Dict[str, Any]:
        """Run package.json validations"""
        result = {
            'file_exists': self.package_file.exists(),
            'valid_json': False,
            'scripts': {'passed': False, 'present': [], 'missing': []},
            'dependencies': {'passed': False, 'installed': [], 'missing': []},
            'react_version': None,
            'node_modules': self._check_node_modules(),
        }
        
        if result['file_exists']:
            try:
                with open(self.package_file, 'r') as f:
                    self.package_data = json.load(f)
                result['valid_json'] = True
                result['scripts'] = self._validate_scripts()
                result['dependencies'] = self._validate_dependencies()
                result['react_version'] = self._get_react_version()
            except Exception as e:
                result['error'] = str(e)
        
        return result
    
    def _validate_scripts(self) -> Dict[str, Any]:
        """Validate required npm scripts"""
        result = {'passed': True, 'present': [], 'missing': []}
        
        if not self.package_data:
            return result
        
        scripts = self.package_data.get('scripts', {})
        for script in self.REQUIRED_SCRIPTS:
            if script in scripts:
                result['present'].append(script)
            else:
                result['missing'].append(script)
                result['passed'] = False
        
        return result
    
    def _validate_dependencies(self) -> Dict[str, Any]:
        """Check critical dependencies are listed"""
        result = {'passed': True, 'installed': [], 'missing': []}
        
        if not self.package_data:
            return result
        
        deps = self.package_data.get('dependencies', {})
        dev_deps = self.package_data.get('devDependencies', {})
        all_deps = {**deps, **dev_deps}
        
        for pkg in self.CRITICAL_DEPENDENCIES:
            if pkg in all_deps:
                result['installed'].append(f"{pkg}@{all_deps[pkg]}")
            else:
                result['missing'].append(pkg)
                result['passed'] = False
        
        return result
    
    def _get_react_version(self) -> str:
        """Get React version"""
        if not self.package_data:
            return None
        
        deps = self.package_data.get('dependencies', {})
        return deps.get('react', 'not found')
    
    def _check_node_modules(self) -> Dict[str, Any]:
        """Check if node_modules exists"""
        node_modules = self.frontend_path / 'node_modules'
        result = {
            'exists': node_modules.exists(),
            'likely_installed': node_modules.exists(),
        }
        
        if result['exists']:
            try:
                package_count = len(list(node_modules.iterdir()))
                result['package_count'] = package_count
                result['likely_installed'] = package_count > 10
            except:
                pass
        
        return result

# ============================================================================
# 2. ENVIRONMENT & CONFIGURATION
# ============================================================================

class FrontendConfigValidator:
    """Validate frontend environment and configuration"""
    
    def __init__(self, frontend_path: str):
        self.frontend_path = Path(frontend_path)
        
    def validate(self) -> Dict[str, Any]:
        """Validate frontend configuration"""
        return {
            'tailwind': self._check_tailwind(),
            'postcss': self._check_postcss(),
            'jsconfig': self._check_jsconfig(),
            'build_config': self._check_build_config(),
        }
    
    def _check_tailwind(self) -> Dict[str, Any]:
        """Check Tailwind CSS configuration"""
        result = {
            'config_exists': False,
            'valid': False,
            'detail': ''
        }
        
        config_file = self.frontend_path / 'tailwind.config.js'
        result['config_exists'] = config_file.exists()
        
        if result['config_exists']:
            try:
                content = config_file.read_text()
                result['valid'] = 'module.exports' in content or 'export default' in content
                result['detail'] = 'Configuration file present and valid'
            except Exception as e:
                result['detail'] = str(e)
        else:
            result['detail'] = 'tailwind.config.js not found'
        
        return result
    
    def _check_postcss(self) -> Dict[str, Any]:
        """Check PostCSS configuration"""
        result = {
            'config_exists': False,
            'valid': False,
            'detail': ''
        }
        
        config_file = self.frontend_path / 'postcss.config.js'
        result['config_exists'] = config_file.exists()
        
        if result['config_exists']:
            try:
                content = config_file.read_text()
                result['valid'] = 'tailwindcss' in content
                result['detail'] = 'Configuration file present'
            except Exception as e:
                result['detail'] = str(e)
        
        return result
    
    def _check_jsconfig(self) -> Dict[str, Any]:
        """Check jsconfig.json for path aliases"""
        result = {
            'config_exists': False,
            'valid': False,
            'has_paths': False,
            'detail': ''
        }
        
        config_file = self.frontend_path / 'jsconfig.json'
        result['config_exists'] = config_file.exists()
        
        if result['config_exists']:
            try:
                data = json.loads(config_file.read_text())
                result['valid'] = 'compilerOptions' in data
                result['has_paths'] = 'paths' in data.get('compilerOptions', {})
                result['detail'] = f"Aliases configured: {result['has_paths']}"
            except Exception as e:
                result['detail'] = str(e)
        
        return result
    
    def _check_build_config(self) -> Dict[str, Any]:
        """Check build configuration"""
        result = {
            'vercel_config': (self.frontend_path / 'vercel.json').exists(),
            'components_json': (self.frontend_path / 'components.json').exists(),
            'detail': 'Build configuration present'
        }
        return result

# ============================================================================
# 3. PROJECT STRUCTURE
# ============================================================================

class ProjectStructureValidator:
    """Validate frontend project structure"""
    
    REQUIRED_DIRS = [
        'src',
        'src/components',
        'src/pages',
        'src/hooks',
        'src/contexts',
        'public',
    ]
    
    CRITICAL_FILES = [
        'src/index.js',
        'src/App.js',
        'public/index.html',
    ]
    
    def __init__(self, frontend_path: str):
        self.frontend_path = Path(frontend_path)
        
    def validate(self) -> Dict[str, Any]:
        """Validate project structure"""
        return {
            'directories': self._check_directories(),
            'files': self._check_critical_files(),
            'component_count': self._count_components(),
            'test_coverage': self._check_test_coverage(),
        }
    
    def _check_directories(self) -> Dict[str, Any]:
        """Check required directories exist"""
        result = {'passed': True, 'present': [], 'missing': []}
        
        for dir_name in self.REQUIRED_DIRS:
            dir_path = self.frontend_path / dir_name
            if dir_path.exists() and dir_path.is_dir():
                result['present'].append(dir_name)
            else:
                result['missing'].append(dir_name)
                result['passed'] = False
        
        return result
    
    def _check_critical_files(self) -> Dict[str, Any]:
        """Check critical files exist"""
        result = {'passed': True, 'present': [], 'missing': []}
        
        for file_name in self.CRITICAL_FILES:
            file_path = self.frontend_path / file_name
            if file_path.exists() and file_path.is_file():
                result['present'].append(file_name)
            else:
                result['missing'].append(file_name)
                result['passed'] = False
        
        return result
    
    def _count_components(self) -> Dict[str, Any]:
        """Count React components"""
        result = {
            'count': 0,
            'jsx_files': [],
            'detail': ''
        }
        
        components_dir = self.frontend_path / 'src' / 'components'
        if components_dir.exists():
            jsx_files = list(components_dir.glob('*.jsx')) + list(components_dir.glob('*.js'))
            result['jsx_files'] = [f.name for f in jsx_files]
            result['count'] = len(result['jsx_files'])
            result['detail'] = f"{result['count']} component files found"
        
        return result
    
    def _check_test_coverage(self) -> Dict[str, Any]:
        """Check test files"""
        result = {
            'test_dir_exists': False,
            'test_files': [],
            'detail': ''
        }
        
        test_dir = self.frontend_path / 'src' / '__tests__'
        result['test_dir_exists'] = test_dir.exists()
        
        if result['test_dir_exists']:
            test_files = list(test_dir.glob('*.test.js')) + list(test_dir.glob('*.test.jsx'))
            result['test_files'] = [f.name for f in test_files]
            result['detail'] = f"{len(result['test_files'])} test files found"
        else:
            result['detail'] = "No __tests__ directory found"
        
        return result

# ============================================================================
# 4. MAIN HEALTH CHECK ORCHESTRATOR
# ============================================================================

class FrontendHealthCheck:
    """Orchestrate all frontend health checks"""
    
    def __init__(self, frontend_path: str):
        self.frontend_path = frontend_path
        self.results = {}
        
    def run(self) -> Dict[str, Any]:
        """Execute all frontend health checks"""
        print(f"\n{colored('📱 FRONTEND HEALTH CHECK', Colors.BLUE)}")
        print(f"   Path: {self.frontend_path}")
        print("=" * 100)
        
        # 1. Package Configuration
        print(f"\n{colored('1. PACKAGE CONFIGURATION', Colors.BLUE)}")
        pkg_validator = PackageJsonValidator(self.frontend_path)
        self.results['package'] = pkg_validator.validate()
        self._print_package_results()
        
        # 2. Frontend Configuration
        print(f"\n{colored('2. BUILD CONFIGURATION', Colors.BLUE)}")
        config_validator = FrontendConfigValidator(self.frontend_path)
        self.results['config'] = config_validator.validate()
        self._print_config_results()
        
        # 3. Project Structure
        print(f"\n{colored('3. PROJECT STRUCTURE', Colors.BLUE)}")
        structure_validator = ProjectStructureValidator(self.frontend_path)
        self.results['structure'] = structure_validator.validate()
        self._print_structure_results()
        
        # 4. Summary
        print(f"\n{colored('4. SUMMARY', Colors.BLUE)}")
        self._print_summary()
        
        return self.results
    
    def _print_package_results(self):
        """Print package.json validation results"""
        pkg = self.results['package']
        
        status = colored('✓', Colors.GREEN) if pkg['valid_json'] else colored('✗', Colors.RED)
        print(f"   package.json: {status} {'Valid JSON' if pkg['valid_json'] else 'Invalid or missing'}")
        
        if pkg.get('error'):
            print(f"      {colored('Error:', Colors.RED)} {pkg['error']}")
            return
        
        if pkg['valid_json']:
            scripts = pkg['scripts']
            status = colored('✓', Colors.GREEN) if scripts['passed'] else colored('⚠', Colors.YELLOW)
            print(f"   Required Scripts: {status} ({len(scripts['present'])}/{len(scripts['present']) + len(scripts['missing'])} found)")
            if scripts['missing']:
                print(f"      {colored('Missing:', Colors.RED)} {', '.join(scripts['missing'])}")
            
            deps = pkg['dependencies']
            status = colored('✓', Colors.GREEN) if deps['passed'] else colored('⚠', Colors.YELLOW)
            print(f"   Critical Dependencies: {status} ({len(deps['installed'])}/{len(deps['installed']) + len(deps['missing'])} found)")
            if deps['missing']:
                print(f"      {colored('Missing:', Colors.RED)} {', '.join(deps['missing'])}")
            
            if pkg['react_version']:
                print(f"   React Version: {pkg['react_version']}")
            
            nm = pkg['node_modules']
            status = colored('✓', Colors.GREEN) if nm['likely_installed'] else colored('⚠', Colors.YELLOW)
            print(f"   node_modules: {status} {'Installed' if nm['likely_installed'] else 'Not found - run npm install'}")
    
    def _print_config_results(self):
        """Print build configuration results"""
        config = self.results['config']
        
        tw = config['tailwind']
        status = colored('✓', Colors.GREEN) if tw['valid'] else colored('⚠', Colors.YELLOW)
        print(f"   Tailwind CSS: {status} {tw['detail']}")
        
        pc = config['postcss']
        status = colored('✓', Colors.GREEN) if pc['valid'] else colored('⚠', Colors.YELLOW)
        print(f"   PostCSS: {status} {pc['detail']}")
        
        jc = config['jsconfig']
        status = colored('✓', Colors.GREEN) if jc['valid'] else colored('⚠', Colors.YELLOW)
        has_paths_str = "(with path aliases)" if jc['has_paths'] else "(no aliases)"
        print(f"   jsconfig.json: {status} {has_paths_str}")
        
        bc = config['build_config']
        print(f"   Vercel Config: {'✓' if bc['vercel_config'] else '⚠'} {'Present' if bc['vercel_config'] else 'Missing'}")
        print(f"   Components Config: {'✓' if bc['components_json'] else '⚠'} {'Present' if bc['components_json'] else 'Missing'}")
    
    def _print_structure_results(self):
        """Print project structure results"""
        struct = self.results['structure']
        
        dirs = struct['directories']
        status = colored('✓', Colors.GREEN) if dirs['passed'] else colored('✗', Colors.RED)
        print(f"   Required Directories: {status} ({len(dirs['present'])}/{len(dirs['present']) + len(dirs['missing'])} found)")
        if dirs['missing']:
            print(f"      {colored('Missing:', Colors.RED)} {', '.join(dirs['missing'])}")
        
        files = struct['files']
        status = colored('✓', Colors.GREEN) if files['passed'] else colored('✗', Colors.RED)
        print(f"   Critical Files: {status} ({len(files['present'])}/{len(files['present']) + len(files['missing'])} found)")
        if files['missing']:
            print(f"      {colored('Missing:', Colors.RED)} {', '.join(files['missing'])}")
        
        comp = struct['component_count']
        print(f"   Components: {comp['count']} files in src/components/")
        
        tests = struct['test_coverage']
        print(f"   Tests: {len(tests['test_files'])} test files ({tests['detail']})")
    
    def _print_summary(self):
        """Print overall health check summary"""
        pkg_ok = self.results['package'].get('valid_json', False) and self.results['package']['dependencies']['passed']
        struct_ok = self.results['structure']['directories']['passed'] and self.results['structure']['files']['passed']
        
        all_ok = pkg_ok and struct_ok
        
        status = colored('✅ READY', Colors.GREEN) if all_ok else colored('⚠️  NEEDS ATTENTION', Colors.YELLOW)
        print(f"   Frontend Status: {status}")

# ============================================================================
# ENTRY POINT
# ============================================================================

def main():
    """Main entry point"""
    repo_path = Path(__file__).resolve().parent
    frontend_path = repo_path / 'frontend'
    health_check = FrontendHealthCheck(frontend_path)
    results = health_check.run()
    return results

if __name__ == '__main__':
    import os
    main()
