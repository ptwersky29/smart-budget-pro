#!/usr/bin/env python3
"""
Deep Health Check - Unified Orchestrator
Runs comprehensive system health checks across backend, frontend, infrastructure, and integration.
Generates detailed report in JSON format and human-readable console output.
"""
import asyncio
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List

# Force UTF-8 encoding on Windows
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Color codes
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    MAGENTA = '\033[95m'
    CYAN = '\033[96m'
    END = '\033[0m'

def colored(text: str, color: str) -> str:
    """Colorize console output"""
    if sys.platform == "win32":
        return text
    return f"{color}{text}{Colors.END}"

# ============================================================================
# DYNAMIC IMPORTS
# ============================================================================

def import_health_check_modules(root_path: str):
    """Dynamically import health check modules"""
    sys.path.insert(0, root_path)
    
    try:
        from backend_health_check import BackendHealthCheck
        from frontend_health_check import FrontendHealthCheck
        from infrastructure_health_check import InfrastructureHealthCheck
        from integration_health_check import IntegrationHealthCheck
        return BackendHealthCheck, FrontendHealthCheck, InfrastructureHealthCheck, IntegrationHealthCheck
    except ImportError as e:
        print(colored(f"❌ Failed to import health check modules: {e}", Colors.RED))
        return None, None, None, None

# ============================================================================
# REPORT GENERATOR
# ============================================================================

class HealthCheckReport:
    """Generate comprehensive health check report"""
    
    def __init__(self, root_path: str):
        self.root_path = root_path
        self.timestamp = datetime.now().isoformat()
        self.start_time = time.time()
        self.results = {
            'metadata': {
                'timestamp': self.timestamp,
                'root_path': root_path,
                'duration_seconds': 0,
            },
            'backend': None,
            'frontend': None,
            'infrastructure': None,
            'integration': None,
        }
        self.summary = {
            'total_checks': 0,
            'passed_checks': 0,
            'warning_checks': 0,
            'failed_checks': 0,
            'status': 'UNKNOWN',
        }
        
    async def run(self) -> Dict[str, Any]:
        """Execute all health checks"""
        self._print_header()
        
        # Import modules
        BackendHealthCheck, FrontendHealthCheck, InfrastructureHealthCheck, IntegrationHealthCheck = \
            import_health_check_modules(self.root_path)
        
        if not all([BackendHealthCheck, FrontendHealthCheck, InfrastructureHealthCheck, IntegrationHealthCheck]):
            print(colored("\n❌ Failed to load health check modules", Colors.RED))
            return self.results
        
        # Load environment
        self._load_environment()
        
        # 1. Backend Health Check
        print("\n")
        backend_hc = BackendHealthCheck(os.path.join(self.root_path, 'backend'))
        self.results['backend'] = await backend_hc.run()
        
        # 2. Frontend Health Check
        print("\n")
        frontend_hc = FrontendHealthCheck(os.path.join(self.root_path, 'frontend'))
        self.results['frontend'] = frontend_hc.run()
        
        # 3. Infrastructure Health Check
        print("\n")
        infrastructure_hc = InfrastructureHealthCheck(self.root_path)
        self.results['infrastructure'] = infrastructure_hc.run()
        
        # 4. Integration Health Check
        print("\n")
        integration_hc = IntegrationHealthCheck(self.root_path)
        self.results['integration'] = integration_hc.run()
        
        # Generate summary
        self._generate_summary()
        self.results['metadata']['duration_seconds'] = time.time() - self.start_time
        self.results['summary'] = self.summary
        
        # Print final summary
        self._print_final_summary()
        
        return self.results
    
    def _load_environment(self):
        """Load environment from .env file"""
        env_file = Path(self.root_path) / 'backend' / '.env'
        if env_file.exists():
            try:
                from dotenv import load_dotenv
                load_dotenv(env_file)
                print(colored("✓ Loaded environment from .env", Colors.GREEN))
            except ImportError:
                print(colored("⚠ python-dotenv not installed, skipping .env load", Colors.YELLOW))
    
    def _generate_summary(self):
        """Generate health check summary"""
        # This would need more sophisticated analysis
        # For now, we'll do basic assessment
        
        # Check backend critical vars
        backend_env = self.results['backend'].get('environment', {})
        backend_critical_missing = len(backend_env.get('required_vars', {}).get('missing', []))
        
        # Check frontend package
        frontend_pkg = self.results['frontend'].get('package', {})
        frontend_missing_deps = len(frontend_pkg.get('dependencies', {}).get('missing', []))
        
        # Check infrastructure
        infra_env = self.results['infrastructure'].get('environment', {})
        infra_critical_missing = len(infra_env.get('critical_vars', {}).get('missing', []))
        
        # Determine overall status
        critical_issues = backend_critical_missing + frontend_missing_deps + infra_critical_missing
        
        if critical_issues == 0:
            self.summary['status'] = 'READY ✅'
        elif critical_issues <= 2:
            self.summary['status'] = 'NEEDS ATTENTION ⚠️'
        else:
            self.summary['status'] = 'FAILED ❌'
    
    def _print_header(self):
        """Print header"""
        print("\n" + "=" * 100)
        print(colored("🏥 DEEP HEALTH CHECK - SMART BUDGET PRO", Colors.MAGENTA))
        print(colored("Comprehensive System Health & Deployment Readiness Assessment", Colors.CYAN))
        print("=" * 100)
        print(f"Started: {self.timestamp}")
        print(f"Path: {self.root_path}")
    
    def _print_final_summary(self):
        """Print final summary"""
        print("\n" + "=" * 100)
        print(colored("📋 FINAL SUMMARY", Colors.MAGENTA))
        print("=" * 100)
        
        print(f"\n{colored('Overall Status:', Colors.BLUE)} {self.summary['status']}")
        
        print(f"\n{colored('Check Results:', Colors.BLUE)}")
        print(f"  ✅ Passed: {self.summary.get('passed_checks', 'N/A')}")
        print(f"  ⚠️  Warnings: {self.summary.get('warning_checks', 'N/A')}")
        print(f"  ❌ Failed: {self.summary.get('failed_checks', 'N/A')}")
        
        duration = self.results['metadata'].get('duration_seconds', 0)
        print(f"\n{colored('Duration:', Colors.BLUE)} {duration:.2f} seconds")
        
        print("\n" + "=" * 100)
        print(colored("✅ Health check complete!", Colors.GREEN))
        print(colored(f"📄 Full report saved to: health_check_report.json", Colors.CYAN))
        print("=" * 100 + "\n")
    
    def save_report(self, filename: str = 'health_check_report.json'):
        """Save report to JSON file"""
        report_path = Path(self.root_path) / filename
        
        try:
            with open(report_path, 'w') as f:
                json.dump(self.results, f, indent=2, default=str)
            print(colored(f"✓ Report saved to: {report_path}", Colors.GREEN))
            return str(report_path)
        except Exception as e:
            print(colored(f"✗ Failed to save report: {e}", Colors.RED))
            return None

# ============================================================================
# MAIN ORCHESTRATOR
# ============================================================================

class DeepHealthCheck:
    """Main orchestrator for deep health checks"""
    
    def __init__(self, root_path: str = None):
        if root_path is None:
            root_path = os.path.dirname(os.path.abspath(__file__))
        self.root_path = root_path
        
    async def run(self) -> Dict[str, Any]:
        """Execute deep health check"""
        report = HealthCheckReport(self.root_path)
        results = await report.run()
        
        # Save report
        report.save_report()
        
        return results
    
    def run_sync(self) -> Dict[str, Any]:
        """Synchronous wrapper for async run"""
        return asyncio.run(self.run())

# ============================================================================
# CLI INTERFACE
# ============================================================================

def print_usage():
    """Print usage information"""
    print("""
Usage: python deep_health_check.py [options]

Options:
  --path PATH         Specify root path (default: current directory)
  --output FILE       Save report to FILE (default: health_check_report.json)
  --help              Show this help message

Examples:
  python deep_health_check.py
  python deep_health_check.py --path /path/to/smart-budget-pro
  python deep_health_check.py --output my_report.json
    """)

def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Deep Health Check for Smart Budget Pro')
    parser.add_argument('--path', default=None, help='Root path of the project')
    parser.add_argument('--output', default='health_check_report.json', help='Output report filename')
    
    args = parser.parse_args()
    
    root_path = args.path or os.path.dirname(os.path.abspath(__file__))
    
    try:
        health_check = DeepHealthCheck(root_path)
        results = health_check.run_sync()
        
        # Save with custom output name
        if args.output != 'health_check_report.json':
            report = HealthCheckReport(root_path)
            report.results = results
            report.save_report(args.output)
        
        return 0
    except Exception as e:
        print(colored(f"\n❌ Health check failed with error: {e}", Colors.RED))
        import traceback
        traceback.print_exc()
        return 1

if __name__ == '__main__':
    exit_code = main()
    sys.exit(exit_code)
