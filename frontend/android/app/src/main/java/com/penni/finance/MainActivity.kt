package com.penni.finance

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Analytics
import androidx.compose.material.icons.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.Savings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val Green = Color(0xFF00A86B)
private val Ink = Color(0xFF0E1B35)
private val Mint = Color(0xFFE9FBF3)
private val Red = Color(0xFFE5484D)

data class NativeTransaction(val merchant: String, val category: String, val amount: Double, val daysAgo: Int)
data class NativeBudget(val name: String, val spent: Double, val limit: Double)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { PenniNativeApp() }
    }
}

@Composable
private fun PenniNativeApp() {
    var signedIn by remember { mutableStateOf(false) }
    var screen by remember { mutableStateOf("Home") }
    MaterialTheme(colorScheme = lightColorScheme(primary = Green, background = Color(0xFFF7FAF9), onBackground = Ink)) {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            if (!signedIn) NativeWelcome(onContinue = { signedIn = true })
            else NativeWorkspace(screen = screen, onScreen = { screen = it })
        }
    }
}

@Composable
private fun NativeWelcome(onContinue: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(76.dp).background(Green, RoundedCornerShape(24.dp)), contentAlignment = Alignment.Center) {
            Text("P", color = Color.White, fontSize = 34.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(26.dp))
        Text("Welcome to Penni", fontSize = 30.sp, fontWeight = FontWeight.Bold, color = Ink)
        Text("Your money, clear and calm.", color = Color(0xFF607087), modifier = Modifier.padding(top = 8.dp))
        Spacer(Modifier.height(42.dp))
        Button(onClick = onContinue, modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(16.dp)) {
            Text("Continue with demo data", fontWeight = FontWeight.SemiBold)
        }
        Text("Native offline workspace • Cloud sync available when connected", color = Color(0xFF718096), fontSize = 12.sp, modifier = Modifier.padding(top = 16.dp))
    }
}

@Composable
private fun NativeWorkspace(screen: String, onScreen: (String) -> Unit) {
    val items = listOf("Home", "Accounts", "Transactions", "Budgets", "More")
    Scaffold(
        bottomBar = {
            NavigationBar(containerColor = Color.White) {
                items.forEach { item ->
                    val icon = when (item) {
                        "Home" -> Icons.Outlined.AccountBalanceWallet
                        "Accounts" -> Icons.Outlined.Savings
                        "Transactions" -> Icons.Outlined.ReceiptLong
                        "Budgets" -> Icons.Outlined.Analytics
                        else -> Icons.Outlined.Add
                    }
                    NavigationBarItem(selected = screen == item, onClick = { onScreen(item) }, icon = { Icon(icon, item) }, label = { Text(item) })
                }
            }
        }
    ) { padding ->
        when (screen) {
            "Home" -> HomeScreen(Modifier.padding(padding))
            "Accounts" -> AccountsScreen(Modifier.padding(padding))
            "Transactions" -> TransactionsScreen(Modifier.padding(padding))
            "Budgets" -> BudgetsScreen(Modifier.padding(padding))
            else -> MoreScreen(Modifier.padding(padding))
        }
    }
}

@Composable
private fun HomeScreen(modifier: Modifier) {
    LazyColumn(modifier = modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Text("Good afternoon", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Ink) }
        item { Text("Your offline demo workspace", color = Color(0xFF64748B)) }
        item { BalanceCard() }
        item { Text("This month", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Ink) }
        item { Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) { MetricCard("Income", "£3,200", Green, Modifier.weight(1f)); MetricCard("Spent", "£249", Red, Modifier.weight(1f)) } }
        item { Text("Recent transactions", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Ink) }
        items(sampleTransactions.take(4)) { TransactionRow(it) }
    }
}

@Composable private fun BalanceCard() { Card(colors = CardDefaults.cardColors(containerColor = Green), shape = RoundedCornerShape(24.dp)) { Column(Modifier.fillMaxWidth().padding(24.dp)) { Text("Total balance", color = Color.White.copy(alpha = .8f)); Text("£1,842.61", color = Color.White, fontSize = 32.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 4.dp)); Text("Offline demo account", color = Color.White.copy(alpha = .8f), modifier = Modifier.padding(top = 12.dp)) } } }
@Composable private fun MetricCard(label: String, value: String, color: Color, modifier: Modifier) { Card(modifier = modifier, colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) { Column(Modifier.padding(16.dp)) { Text(label, color = Color(0xFF64748B), fontSize = 12.sp); Text(value, color = color, fontWeight = FontWeight.Bold, fontSize = 22.sp, modifier = Modifier.padding(top = 6.dp)) } } }
@Composable private fun AccountsScreen(modifier: Modifier) { ScreenHeader("Accounts", modifier) { AccountCard("Penni Demo Account", "Current account", "£1,842.61") } }
@Composable private fun TransactionsScreen(modifier: Modifier) { ScreenHeader("Transactions", modifier) { sampleTransactions.forEach { TransactionRow(it) } } }
@Composable private fun BudgetsScreen(modifier: Modifier) { ScreenHeader("Budgets", modifier) { sampleBudgets.forEach { BudgetRow(it) } } }
@Composable private fun MoreScreen(modifier: Modifier) { ScreenHeader("More", modifier) { listOf("Insights", "Settings", "Help & support").forEach { Text(it, modifier = Modifier.fillMaxWidth().background(Color.White, RoundedCornerShape(14.dp)).padding(18.dp), color = Ink) } } }
@Composable private fun ScreenHeader(title: String, modifier: Modifier, content: @Composable ColumnScope.() -> Unit) { Column(modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) { Text(title, fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Ink); content() } }
@Composable private fun AccountCard(name: String, type: String, balance: String) { Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) { Row(Modifier.fillMaxWidth().padding(20.dp), horizontalArrangement = Arrangement.SpaceBetween) { Column { Text(name, fontWeight = FontWeight.SemiBold); Text(type, color = Color(0xFF64748B), fontSize = 13.sp) }; Text(balance, color = Green, fontWeight = FontWeight.Bold, fontSize = 20.sp) } } }
@Composable private fun TransactionRow(tx: NativeTransaction) { Row(Modifier.fillMaxWidth().background(Color.White, RoundedCornerShape(16.dp)).padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) { Column { Text(tx.merchant, fontWeight = FontWeight.SemiBold, color = Ink); Text(tx.category.replaceFirstChar { it.uppercase() }, color = Color(0xFF64748B), fontSize = 12.sp) }; Text(if (tx.amount >= 0) "+£%.2f".format(tx.amount) else "-£%.2f".format(-tx.amount), color = if (tx.amount >= 0) Green else Red, fontWeight = FontWeight.Bold) } }
@Composable private fun BudgetRow(budget: NativeBudget) { val progress = (budget.spent / budget.limit).toFloat(); Column(Modifier.fillMaxWidth().background(Color.White, RoundedCornerShape(16.dp)).padding(16.dp)) { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(budget.name, fontWeight = FontWeight.SemiBold); Text("£%.0f / £%.0f".format(budget.spent, budget.limit), color = Color(0xFF64748B), fontSize = 13.sp) }; LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth().padding(top = 12.dp), color = if (progress > .8f) Red else Green, trackColor = Mint) } }

private val sampleTransactions = listOf(NativeTransaction("Salary", "income", 3200.0, 1), NativeTransaction("Tesco Express", "grocery", -42.50, 2), NativeTransaction("TfL Travel", "public transport", -7.20, 3), NativeTransaction("Octopus Energy", "utilities", -85.40, 5), NativeTransaction("Coffee Corner", "eating out", -4.80, 6), NativeTransaction("Netflix", "entertainment", -10.99, 9))
private val sampleBudgets = listOf(NativeBudget("Grocery", 198.40, 320.0), NativeBudget("Public Transport", 64.20, 120.0), NativeBudget("Utilities", 85.40, 180.0), NativeBudget("Eating Out", 96.80, 140.0))
