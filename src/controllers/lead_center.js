import { prisma } from "../config/dbConfig.js";
import { prismaContext } from "../config/prismaContext.js";

const renderLeadCenter = async (req, res) => {
    try {
        const leadCenter = await prisma.lead.findMany({
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

const acceptAsAgent = async (req, res) => {
    const { email } = req.params;
    try {
        const lead = await prisma.lead.findUnique({
            where: { email: email },
        });

        if (!lead) {
            return res.status(404).json({ error: "Lead not found" });
        }

        await prismaContext.run({ userId: req.user?.user_id ?? "anonymous" }, async () => {
            try {
                await prisma.lead.update({
                    where: { email: email },
                    data: { isAcepted: true },
                });
            } catch (err) {
                console.error("Error updating lead to accepted:", err);
                throw err;
            }
        });

        return res.status(200).json({ message: "Lead accepted as agent successfully" });

    }
    catch (error) {
        console.error("Error accepting lead as agent:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

const addLead = async (req, res) => {
    const { fullName, email, phone, companyNames, companyStates, dateOfBirth, npn, address, city, state, zipCode } = req.body;
    try {
        const newLead = await prisma.lead.create({
            data: {
                fullName,
                email,
                phone,
                companyNames,
                companyStates,
                dateOfBirth: new Date(dateOfBirth),
                npn,
                address,
                city,
                state,
                zipCode,
            },
        });
        res.status(201).json(newLead);
    } catch (error) {
        console.error("Error adding new lead:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}

const deleteLead = async (req, res) => {
    const { id } = req.params;

    if (!id) {
        return res.status(400).json({ error: "id is required" });
    }
    try {
        await prismaContext.run({ userId: req.user?.user_id ?? "anonymous" }, async () => {
            await prisma.lead.delete({
                where: { id: id },
            });
        });
        res.status(200).json({ success: true, message: "Lead deleted successfully" });
    } catch (error) {
        console.error("Error deleting lead:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}

const renderNewLead = async (req, res) => {
    const companies = await prisma.company.findMany({
        select: {
            id: true,
            name: true,
        },
    });

    res.render("newLead", { companies, lead: {}, isLoaded: false });
}

const loadLead = async (req, res) => {
    const { id } = req.params;
    if (!id) {
        return res.status(400).json({ error: "Lead ID is required" });
    }
    try {
        const lead = await prisma.lead.findUnique({ where: { id: id } });
        if (!lead) {
            return res.status(404).json({ error: "Lead not found" });
        }
        const companies = await prisma.company.findMany({
            select: {
                id: true,
                name: true,
            },
        });
        res.render("newLead", { companies, lead, isLoaded: true });
    } catch (error) {
        console.error("Error loading lead:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}

export { renderLeadCenter, deleteLead, acceptAsAgent, addLead, renderNewLead, loadLead };