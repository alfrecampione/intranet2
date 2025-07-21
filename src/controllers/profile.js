import { prisma } from "../config/dbConfig.js";

const renderProfile = async (req, res) => {
    const user = req.user;

    const profile = await prisma.user.findUnique({
        where: {
            user_id: user_id
        }
    });

    const personalInfo = await prisma.personalInfo.findUnique({
        where: {
            userId: user_id
        }
    });

    res.render("profile", { user: user, profile: profile, personalInfo: personalInfo });
}


export { renderProfile }