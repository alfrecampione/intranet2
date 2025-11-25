import { prisma } from "./config/dbConfig.js";

async function testEmailConfiguration() {
    console.log('🔍 Testing email configuration...\n');

    // 1. Check newUserAlerts
    const alerts = await prisma.newUserAlerts.findMany();
    console.log(`📧 Emails configured for notifications (newUserAlerts): ${alerts.length}`);
    if (alerts.length > 0) {
        alerts.forEach(alert => {
            console.log(`   ✓ ${alert.email} (${alert.display_name})`);
        });
    } else {
        console.log('   ⚠️  WARNING: No emails configured! Notifications will not be sent.');
    }

    console.log('\n');

    // 2. Check pending onboarding emails
    const pendingOnboarding = await prisma.onboardingSentEmails.findMany({
        where: { pending: true }
    });
    console.log(`⏳ Pending onboarding emails: ${pendingOnboarding.length}`);
    if (pendingOnboarding.length > 0) {
        pendingOnboarding.forEach(email => {
            console.log(`   • ${email.email} (sent: ${email.sentAt})`);
        });
    } else {
        console.log('   ✓ No pending onboarding emails.');
    }

    console.log('\n');

    // 3. Check completed onboarding
    const completedOnboarding = await prisma.onboardingSentEmails.findMany({
        where: { pending: false }
    });
    console.log(`✅ Completed onboarding emails: ${completedOnboarding.length}`);
    if (completedOnboarding.length > 0) {
        completedOnboarding.forEach(email => {
            console.log(`   ✓ ${email.email}`);
        });
    }

    console.log('\n');

    // 4. Check users with registrationCompleted
    const usersCompleted = await prisma.user.count({
        where: { registrationCompleted: true }
    });
    console.log(`👥 Users with completed registration: ${usersCompleted}`);

    console.log('\n✅ Email configuration test completed.');

    await prisma.$disconnect();
}

testEmailConfiguration().catch(console.error);
