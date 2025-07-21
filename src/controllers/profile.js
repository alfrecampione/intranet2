import { prisma } from "../config/dbConfig.js";

const renderProfile = async (req, res) => {
    user_id = req.params.user_id;

    const user = prisma.user.findUnique({
        where: {
            user_id: user_id
        }
    });

    const personalInfo = prisma.personalInfo.findUnique({
        where: {
            userId: user_id
        }
    });

    res.render("profile", { user: user, personalInfo: personalInfo });
}


export { renderProfile }