import { prisma } from "../config/dbConfig.js";
import { prismaContext } from "../config/prismaContext.js";

const renderLeadCenter = async (req, res) => {
    try {
        const leadCenter = await prisma.lead.findMany({
            include: { Company: true },
            orderBy: { fullName: "desc" },
        });

        res.render("lead_center", {
            user: req.user,
            leadCenter,
            activePage: "lead-center",
        });
    } catch (error) {
        console.error("Error fetching lead centers:", error);
        res.status(500).send("Internal Server Error");
    }
};

const deleteLead = async (req, res) => {
    const { id } = req.params;
    try {
        const lead = await prisma.lead.delete({
            where: { id: id },
        });
        res.status(200).json({ success: true, message: "Lead deleted successfully" });
    } catch (error) {
        console.error("Error deleting lead:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}

export { renderLeadCenter, deleteLead };