import { prisma } from "../config/dbConfig.js";

const renderProfile = async (req, res) => {
    const user = req.user;

    const userId = req.params.id ?? user.user_id

    const profile = await prisma.user.findUnique({
        where: {
            user_id: userId
        }
    });

    const personalInfo = await prisma.personalInfo.findUnique({
        where: {
            userId: userId
        }
    });

    const contactInfo = await prisma.contactInfo.findUnique({
        where: {
            userId: userId
        }
    });

    res.render("profile", { user: user, profile: profile, personalInfo: personalInfo, contactInfo: contactInfo });
}


export { renderProfile }