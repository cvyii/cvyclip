targetScope = 'resourceGroup'
@description('Owner email for Azure budget alerts; not an enforcement cap.')
param contactEmail string
param startDate string
resource budget 'Microsoft.Consumption/budgets@2024-08-01' = {
  name: 'cvyclip-monthly-target'
  properties: {
    category: 'Cost'
    amount: 5
    timeGrain: 'Monthly'
    timePeriod: { startDate: startDate }
    notifications: {
      actual80: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 80, thresholdType: 'Actual', contactEmails: [contactEmail] }
      forecast100: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 100, thresholdType: 'Forecasted', contactEmails: [contactEmail] }
    }
  }
}
