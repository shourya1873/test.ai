"use server";

import { generateQuestions, verifyTestWithGemini } from "@/lib/gemini";

import Test from "@/models/Test";
import TestResult from "@/models/TestResult";
import dbConnect from "@/lib/dbConnect";

export async function createTest(testDetails) {
  try {
    await dbConnect();

    const questions = await generateQuestions(testDetails);

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("Invalid questions generated");
    }

    const newTest = new Test({
      ...testDetails,
      questions: questions,
    });

    await newTest.save();

    return { success: true, testId: newTest._id.toString() };
  } catch (error) {
    console.error("Error creating test:", error);
    return { success: false, error: error.message };
  }
}

export async function getTestById(testId) {
  try {
    await dbConnect();
    const test = await Test.findById(testId);
    if (!test) {
      return null;
    }

    return JSON.parse(JSON.stringify(test));
  } catch (error) {
    console.error("Error fetching test:", error);
    return null;
  }
}

export async function submitTest(testId, userAnswers, userId) {
  try {
    await dbConnect();
    const test = await Test.findById(testId);

    if (!test) {
      console.error("Test not found:", testId);
      return { success: false, error: "Test not found" };
    }

    console.log("Verifying test with Gemini...");
    let geminiResult;
    try {
      geminiResult = await verifyTestWithGemini(test, userAnswers);
    } catch (error) {
      console.error("Error verifying test with Gemini:", error);
      return { success: false, error: "Failed to verify test results" };
    }
    console.log("Gemini result:", geminiResult);

    const testResult = new TestResult({
      userId: userId,
      testId: testId,
      score: geminiResult.score,
      correctAnswers: geminiResult.correctAnswers,
      wrongAnswers: geminiResult.wrongAnswers,
      analysis: geminiResult.analysis,
      userAnswers: userAnswers,
    });

    console.log("Saving test result...");
    await testResult.save();
    console.log("Test result saved successfully");

    return { success: true, resultId: testResult._id.toString() };
  } catch (error) {
    console.error("Error submitting test:", error);
    return { success: false, error: error.message || "Failed to submit test" };
  }
}

export async function getTestResult(resultId, userId) {
  try {
    await dbConnect();
    const testResult = await TestResult.findOne({
      _id: resultId,
      userId: userId,
    }).populate({
      path: "testId",
      select: "title questions",
    });

    if (!testResult) {
      return { success: false, error: "Test result not found" };
    }

    // Combine test result data with test questions
    const combinedData = {
      id: testResult._id.toString(),
      title: testResult.testId.title,
      date: testResult.createdAt,
      score: testResult.score,
      questions: testResult.testId.questions.map((q, index) => ({
        text: q.text,
        userAnswer: testResult.userAnswers[index],
        correctAnswer: q.correctAnswer,
      })),
      analysis: testResult.analysis,
    };

    return {
      success: true,
      data: combinedData,
    };
  } catch (error) {
    console.error("Error fetching test result:", error);
    return { success: false, error: "Failed to fetch test result" };
  }
}

export const getUserTests = async (userId) => {
  try {
    await dbConnect();
    const testResults = await TestResult.find({ userId: userId })
      .populate("testId", "title")
      .sort({ createdAt: -1 });

    return testResults.map((result) => ({
      id: result._id.toString(),
      title: result.testId.title,
      date: result.createdAt,
      score: result.score,
    }));
  } catch (error) {
    console.error("Error fetching user tests:", error);
    return [];
  }
};
