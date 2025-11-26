import { prisma } from "./src/config/dbConfig.js";

const S3_BASE_URL = "https://goldenhealth-files.s3.us-east-1.amazonaws.com/";

async function migrateDocumentsToS3() {
    console.log('🔄 Starting migration of documents to S3 URLs...');

    try {
        const documents = await prisma.documents.findMany();
        console.log(`📄 Found ${documents.length} document records to process.`);

        let updatedCount = 0;

        for (const doc of documents) {
            const updates = {};

            // Check each field and add S3 prefix if not null and doesn't already have it
            const fields = [
                'directDepositForm',
                'driverLicense',
                'EINconfirmation',
                'eANDo',
                'proLicense',
                'corporationLicense',
                'ffmCertification',
                'gaCertification',
                'gaLicense',
                'sunbiz',
                'taxIdentificationW9'
            ];

            for (const field of fields) {
                const value = doc[field];
                if (value && !value.startsWith('http')) {
                    // Remove leading slash if present
                    const cleanPath = value.startsWith('/') ? value.substring(1) : value;
                    updates[field] = `${S3_BASE_URL}${cleanPath}`;
                }
            }

            // Only update if there are changes
            if (Object.keys(updates).length > 0) {
                await prisma.documents.update({
                    where: { id: doc.id },
                    data: updates
                });
                updatedCount++;
                console.log(`✅ Updated document for user ${doc.userId} - ${Object.keys(updates).length} field(s)`);
            }
        }

        console.log(`✨ Migration completed! Updated ${updatedCount} document records.`);
    } catch (error) {
        console.error('❌ Error during migration:', error);
    } finally {
        await prisma.$disconnect();
    }
}

migrateDocumentsToS3();
