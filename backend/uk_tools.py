"""Phase 7 — UK Tools: HMRC tax calculator, Universal Credit estimator."""
import logging
from typing import Optional

from fastapi import APIRouter, Request, Depends, Query
from pydantic import BaseModel, Field
from auth import get_current_user

logger = logging.getLogger("uk_tools")

# ── 2025/2026 UK Tax Rates ────────────────────────────────────────────────

PERSONAL_ALLOWANCE = 12570
BASIC_RATE_LIMIT = 50270
HIGHER_RATE_LIMIT = 125140
BASIC_RATE = 0.20
HIGHER_RATE = 0.40
ADDITIONAL_RATE = 0.45
PA_TAPER_THRESHOLD = 100000

NI_THRESHOLD_PRIMARY = 12570
NI_UPPER_LIMIT = 50270
NI_BASIC_RATE = 0.08
NI_HIGHER_RATE = 0.02

STUDENT_LOAN_PLAN2_THRESHOLD = 27295
STUDENT_LOAN_PLAN5_THRESHOLD = 25000
STUDENT_LOAN_RATE = 0.09

# ── Universal Credit 2025/2026 ────────────────────────────────────────────

UC_STANDARD_SINGLE = 393.45
UC_STANDARD_COUPLE = 553.25
UC_CHILD_FIRST = 287.92
UC_CHILD_SUBSEQUENT = 244.58
UC_LCW = 146.37
UC_LCWRA = 390.73
UC_CARER = 185.86
UC_CHILDCARE_MAX_PCT = 0.85
UC_WORK_ALLOWANCE_NO_HOUSING = 573.00
UC_WORK_ALLOWANCE_WITH_HOUSING = 404.00
UC_TAPER_RATE = 0.55


class TaxCalcIn(BaseModel):
    annual_salary: float = Field(..., gt=0)
    pension_contrib_pct: float = 0
    student_loan_plan: Optional[str] = None
    other_income: float = 0
    dividends: float = 0
    marriage_allowance: bool = False


class UCEstimateIn(BaseModel):
    is_single: bool = True
    children: int = 0
    monthly_income: float = 0
    monthly_rent: float = 0
    has_housing_cost: bool = False
    has_lcw: bool = False
    has_lcwra: bool = False
    has_carer: bool = False
    monthly_childcare_costs: float = 0
    under_25: bool = False


def _calc_income_tax(gross: float, personal_allowance: float) -> tuple[float, dict]:
    bands = {}
    taxable = max(0, gross - personal_allowance)
    basic = max(0, min(taxable, BASIC_RATE_LIMIT - personal_allowance))
    bands["basic"] = {"amount": round(basic, 2), "rate": BASIC_RATE, "tax": round(basic * BASIC_RATE, 2)}
    remaining = max(0, taxable - basic)
    higher = max(0, min(remaining, HIGHER_RATE_LIMIT - BASIC_RATE_LIMIT))
    bands["higher"] = {"amount": round(higher, 2), "rate": HIGHER_RATE, "tax": round(higher * HIGHER_RATE, 2)}
    additional = max(0, taxable - basic - higher)
    bands["additional"] = {"amount": round(additional, 2), "rate": ADDITIONAL_RATE, "tax": round(additional * ADDITIONAL_RATE, 2)}
    total_tax = sum(b["tax"] for b in bands.values())
    return total_tax, bands


def build_router() -> APIRouter:
    router = APIRouter(prefix="/uk", tags=["uk"])

    @router.get("/health")
    async def uk_health():
        return {"status": "ok", "version": "2025/2026"}

    @router.post("/tax-calculator")
    async def tax_calculator(payload: TaxCalcIn, user: dict = Depends(get_current_user)):
        gross = payload.annual_salary + payload.other_income
        pension = payload.annual_salary * (payload.pension_contrib_pct / 100)
        personal_allowance = PERSONAL_ALLOWANCE
        if gross > PA_TAPER_THRESHOLD:
            reduction = (gross - PA_TAPER_THRESHOLD) / 2
            personal_allowance = max(0, personal_allowance - reduction)
        if payload.marriage_allowance:
            personal_allowance += 1260
        taxable_income = gross - pension
        income_tax, tax_bands = _calc_income_tax(taxable_income, personal_allowance)
        ni_gross = gross - pension
        ni = 0
        ni_bands = {}
        if ni_gross > NI_THRESHOLD_PRIMARY:
            ni_basic_gross = max(0, min(ni_gross, NI_UPPER_LIMIT) - NI_THRESHOLD_PRIMARY)
            ni_basic = ni_basic_gross * NI_BASIC_RATE
            ni_higher_gross = max(0, ni_gross - NI_UPPER_LIMIT)
            ni_higher = ni_higher_gross * NI_HIGHER_RATE
            ni = ni_basic + ni_higher
            ni_bands["basic"] = {"amount": round(ni_basic_gross, 2), "rate": NI_BASIC_RATE, "ni": round(ni_basic, 2)}
            ni_bands["higher"] = {"amount": round(ni_higher_gross, 2), "rate": NI_HIGHER_RATE, "ni": round(ni_higher, 2)}
        student_loan = 0
        if payload.student_loan_plan == "plan2":
            student_loan = max(0, (gross - STUDENT_LOAN_PLAN2_THRESHOLD) * STUDENT_LOAN_RATE)
        elif payload.student_loan_plan == "plan5":
            student_loan = max(0, (gross - STUDENT_LOAN_PLAN5_THRESHOLD) * STUDENT_LOAN_RATE)
        dividend_allowance = 500
        dividend_tax = max(0, (payload.dividends - dividend_allowance) * 0.0875) if payload.dividends > dividend_allowance else 0
        total_deductions = income_tax + ni + student_loan + dividend_tax + pension
        take_home = gross - total_deductions
        monthly_take_home = take_home / 12
        return {
            "gross_income": round(gross, 2),
            "pension_contribution": round(pension, 2),
            "personal_allowance": round(personal_allowance, 2),
            "taxable_income": round(taxable_income, 2),
            "income_tax": round(income_tax, 2),
            "tax_bands": tax_bands,
            "national_insurance": round(ni, 2),
            "ni_bands": ni_bands,
            "student_loan": round(student_loan, 2),
            "dividend_tax": round(dividend_tax, 2),
            "total_deductions": round(total_deductions, 2),
            "take_home_annual": round(take_home, 2),
            "take_home_monthly": round(monthly_take_home, 2),
            "effective_tax_rate": round((total_deductions / gross * 100), 1) if gross else 0,
        }

    @router.post("/universal-credit")
    async def universal_credit(payload: UCEstimateIn, user: dict = Depends(get_current_user)):
        std_allowance = UC_STANDARD_SINGLE if payload.is_single else UC_STANDARD_COUPLE
        if payload.under_25 and payload.is_single:
            std_allowance = 311.68
        child_element = 0
        if payload.children > 0:
            child_element = UC_CHILD_FIRST + UC_CHILD_SUBSEQUENT * (payload.children - 1)
        lcw_element = UC_LCW if payload.has_lcw else 0
        lcwra_element = UC_LCWRA if payload.has_lcwra else 0
        carer_element = UC_CARER if payload.has_carer else 0
        housing_element = min(payload.monthly_rent, 1200) if payload.has_housing_cost else 0
        max_childcare = payload.monthly_childcare_costs * UC_CHILDCARE_MAX_PCT if payload.monthly_childcare_costs else 0
        total_entitlement = std_allowance + child_element + lcw_element + lcwra_element + carer_element + housing_element + max_childcare
        work_allowance = UC_WORK_ALLOWANCE_NO_HOUSING if not payload.has_housing_cost else UC_WORK_ALLOWANCE_WITH_HOUSING
        income_after_allowance = max(0, payload.monthly_income - work_allowance)
        deduction = income_after_allowance * UC_TAPER_RATE
        final_award = max(0, total_entitlement - deduction)
        return {
            "standard_allowance": round(std_allowance, 2),
            "child_element": round(child_element, 2),
            "lcw_element": round(lcw_element, 2),
            "lcwra_element": round(lcwra_element, 2),
            "carer_element": round(carer_element, 2),
            "housing_element": round(housing_element, 2),
            "childcare_element": round(max_childcare, 2),
            "total_entitlement": round(total_entitlement, 2),
            "work_allowance": round(work_allowance, 2),
            "income_after_allowance": round(income_after_allowance, 2),
            "taper_deduction": round(deduction, 2),
            "final_monthly_award": round(final_award, 2),
            "final_annual_award": round(final_award * 12, 2),
            "breakdown": {
                "elements": {
                    "standard_allowance": round(std_allowance, 2),
                    "child": round(child_element, 2),
                    "lcw": round(lcw_element, 2),
                    "lcwra": round(lcwra_element, 2),
                    "carer": round(carer_element, 2),
                    "housing": round(housing_element, 2),
                    "childcare": round(max_childcare, 2),
                },
                "deductions": {
                    "work_allowance": round(work_allowance, 2),
                    "taper_rate_pct": UC_TAPER_RATE * 100,
                    "taper_deduction": round(deduction, 2),
                },
            },
        }

    return router
