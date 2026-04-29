const dotenv = require("dotenv");
const path = require("path");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

dotenv.config({ path: path.join(__dirname, "../../.env") });

const {
  Department,
  User,
  Faculty,
  Student,
  Subject,
  Timetable,
  Attendance,
  seedIndexes,
} = require("../models");

const normalizeUtcDate = (value) => {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const getAcademicYear = () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const next = String((year + 1) % 100).padStart(2, "0");
  return `${year}-${next}`;
};

const randomStatus = () => {
  const rand = Math.random();
  if (rand < 0.75) {
    return "P";
  }
  if (rand < 0.95) {
    return "A";
  }
  return "L";
};

const connectDatabase = async () => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is required to run seeding.");
  }

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
};

const clearDatabase = async () => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("clearDatabase is blocked in production environment.");
  }

  await Promise.all([
    Attendance.deleteMany({}),
    Timetable.deleteMany({}),
    Subject.deleteMany({}),
    Student.deleteMany({}),
    Faculty.deleteMany({}),
    User.deleteMany({}),
    Department.deleteMany({}),
  ]);
};

const seedDatabase = async () => {
  let attendanceCount = 0;

  try {
    await connectDatabase();
    await seedIndexes();

    if (process.env.NODE_ENV === "production") {
      throw new Error("Seeding is blocked in production environment.");
    }

    await clearDatabase();

    const departments = await Department.insertMany([
      { name: "Computer Science", code: "CSD", totalSemesters: 8 },
      { name: "Computer Science and Engineering", code: "CSE", totalSemesters: 8 },
      { name: "Electronics and Communication", code: "ECE", totalSemesters: 8 },
      { name: "Mechanical Engineering", code: "MECH", totalSemesters: 8 },
    ]);

    const facultySpecs = [
      { names: ["Ravi Kumar", "Nisha Reddy"], deptCode: "CSD" },
      { names: ["Suresh Kumar", "Anitha Rao"], deptCode: "CSE" },
      { names: ["Arun Varma", "Shreya Rao"], deptCode: "ECE" },
      { names: ["Vikram Patel", "Keerthi Das"], deptCode: "MECH" },
    ];

    const facultyDocs = [];
    for (const spec of facultySpecs) {
      const department = departments.find((dept) => dept.code === spec.deptCode);
      for (let i = 0; i < spec.names.length; i += 1) {
        const seq = i + 1;
        facultyDocs.push({
          employeeId: `${spec.deptCode}F${String(seq).padStart(2, "0")}`,
          name: spec.names[i],
          email: `${spec.deptCode.toLowerCase()}.faculty${seq}@college.com`,
          phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
          departmentId: department._id,
          designation: seq === 1 ? "Assistant Professor" : "Associate Professor",
          specialization: spec.deptCode,
          isActive: true,
        });
      }
    }

    const faculty = await Faculty.insertMany(facultyDocs);
    const facultyPasswordHash = await bcrypt.hash("Faculty@123", 12);

    await User.insertMany(
      faculty.map((member) => ({
        email: member.email,
        passwordHash: facultyPasswordHash,
        role: "faculty",
        profileId: member._id,
        profileModel: "Faculty",
        isActive: true,
        refreshTokens: [],
      }))
    );

    const adminPasswordHash = await bcrypt.hash("Admin@123", 12);
    await User.create({
      email: "admin@college.com",
      passwordHash: adminPasswordHash,
      role: "admin",
      isActive: true,
      refreshTokens: [],
    });

    const studentDocs = [];
    const studentSeeds = {
      CSD: ["Aarav", "Ishita", "Mohan", "Priya", "Rohan", "Teja", "Nithin", "Sneha", "Karan", "Lavanya"],
      CSE: ["Aditya", "Bhavana", "Charan", "Diksha", "Eshwar", "Farah", "Gowtham", "Hema", "Imran", "Jahnavi"],
      ECE: ["Harsha", "Divya", "Ajay", "Sanjana", "Manoj", "Bhavya", "Rahul", "Pooja", "Tarun", "Meghana"],
      MECH: ["Surya", "Anil", "Ritika", "Sandeep", "Varun", "Tanvi", "Pranav", "Kavya", "Ritesh", "Neha"],
    };

    for (const department of departments) {
      const names = studentSeeds[department.code] || [];
      for (let i = 0; i < 10; i += 1) {
        const index = i + 1;
        const seedName = names[i] || `Student${index}`;
        studentDocs.push({
          rollNumber: `${department.code}${String(2300 + index)}`,
          name: `${seedName} ${department.code}`,
          email: `${department.code.toLowerCase()}.student${index}@college.com`,
          phone: `8${Math.floor(100000000 + Math.random() * 899999999)}`,
          departmentId: department._id,
          semester: 3,
          section: "A",
          batch: "2022-2026",
          guardianPhone: `7${Math.floor(100000000 + Math.random() * 899999999)}`,
          isActive: true,
        });
      }
    }

    const students = await Student.insertMany(studentDocs);
    const studentPasswordHash = await bcrypt.hash("Student@123", 12);

    await User.insertMany(
      students.map((student) => ({
        email: student.email,
        passwordHash: studentPasswordHash,
        role: "student",
        profileId: student._id,
        profileModel: "Student",
        isActive: true,
        refreshTokens: [],
      }))
    );

    const subjectBlueprint = {
      CSD: [
        { code: "CSD301", name: "Data Structures", credits: 4, type: "theory" },
        { code: "CSD302", name: "Database Systems", credits: 4, type: "theory" },
        { code: "CSD303", name: "Object Oriented Lab", credits: 2, type: "lab" },
      ],
      CSE: [
        { code: "CSE301", name: "Data Structures", credits: 4, type: "theory" },
        { code: "CSE302", name: "Database Systems", credits: 4, type: "theory" },
        { code: "CSE303", name: "Object Oriented Lab", credits: 2, type: "lab" },
      ],
      ECE: [
        { code: "EC301", name: "Signals and Systems", credits: 4, type: "theory" },
        { code: "EC302", name: "Digital Electronics", credits: 4, type: "theory" },
        { code: "EC303", name: "Circuits Lab", credits: 2, type: "lab" },
      ],
      MECH: [
        { code: "ME301", name: "Thermodynamics", credits: 4, type: "theory" },
        { code: "ME302", name: "Fluid Mechanics", credits: 4, type: "theory" },
        { code: "ME303", name: "Manufacturing Lab", credits: 2, type: "lab" },
      ],
    };

    const subjectDocs = [];
    for (const department of departments) {
      const items = subjectBlueprint[department.code] || [];
      for (const item of items) {
        subjectDocs.push({
          subjectCode: item.code,
          name: item.name,
          departmentId: department._id,
          semester: 3,
          credits: item.credits,
          type: item.type,
          totalPlannedClasses: 60,
          isActive: true,
        });
      }
    }

    const subjects = await Subject.insertMany(subjectDocs);

    const academicYear = getAcademicYear();
    const timetableDocs = [];

    for (const department of departments) {
      const deptFaculty = faculty.filter(
        (member) => String(member.departmentId) === String(department._id)
      );
      const deptSubjects = subjects.filter(
        (subject) => String(subject.departmentId) === String(department._id)
      );

      for (let i = 0; i < deptSubjects.length; i += 1) {
        const assignedFaculty = deptFaculty[i % deptFaculty.length];
        timetableDocs.push({
          facultyId: assignedFaculty._id,
          subjectId: deptSubjects[i]._id,
          departmentId: department._id,
          semester: 3,
          section: "A",
          academicYear,
          schedule: [
            {
              day: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i % 6],
              timeSlot: `${9 + i}:00-${10 + i}:00`,
              roomNo: `${department.code}-10${i + 1}`,
            },
          ],
          isActive: true,
        });
      }
    }

    const timetables = await Timetable.insertMany(timetableDocs);
    const subjectFacultyMap = new Map(
      timetables.map((entry) => [String(entry.subjectId), entry.facultyId])
    );

    const today = normalizeUtcDate(new Date());
    const attendanceDocs = [];

    for (let offset = 0; offset < 60; offset += 1) {
      const date = new Date(today);
      date.setUTCDate(today.getUTCDate() - offset);

      for (const student of students) {
        const studentSubjects = subjects.filter(
          (subject) =>
            String(subject.departmentId) === String(student.departmentId) &&
            subject.semester === student.semester
        );

        for (const subject of studentSubjects) {
          attendanceDocs.push({
            studentId: student._id,
            subjectId: subject._id,
            facultyId: subjectFacultyMap.get(String(subject._id)),
            departmentId: student.departmentId,
            date,
            session: "morning",
            status: randomStatus(),
            markedAt: date,
          });
        }
      }
    }

    if (attendanceDocs.length > 0) {
      await Attendance.insertMany(attendanceDocs, { ordered: false });
      attendanceCount = attendanceDocs.length;
    }

    console.log(
      `Seeded: ${students.length} students, ${faculty.length} faculty, ${attendanceCount} attendance records`
    );

    await mongoose.disconnect();
    return {
      students: students.length,
      faculty: faculty.length,
      attendance: attendanceCount,
    };
  } catch (error) {
    console.error("Database seeding failed:", error.message);
    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      // Ignore disconnection errors during failure handling.
    }
    throw error;
  }
};

module.exports = {
  seedDatabase,
  clearDatabase,
};

if (require.main === module) {
  seedDatabase()
    .then(() => {
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
}
