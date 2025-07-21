import { prisma } from "../config/dbConfig.js";

const renderProfile = async (req, res) => {
    const user_id = req.params.id;

    const user = await prisma.user.findUnique({
        where: {
            user_id: user_id
        }
    });

    const personalInfo = await prisma.personalInfo.findUnique({
        where: {
            userId: user_id
        }
    });

    res.render("profile", { user: user, personalInfo: personalInfo });
}


export { renderProfile }