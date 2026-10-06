#include<iostream>
#include<algorithm>
using namespace std;
int n;
int a[100] = {1};
void print(int t){
	for (int i = 1; i < t; i++) cout << a[i] << "+";
	cout << a[t] << endl;
}
void dfs(int x, int t){
	for (int i = a[t - 1]; i < x; i++){
		if (i >= n) continue;
		a[t] = i;
		dfs(x-i, t+1);
	}
	a[t] = x;
	if (x >= a[t-1] && x < n) print(t);
}
int main(){
	cin >> n;
	dfs(n, 1);
	return 0;
}

// 下面的GPT提示的偏现代思路

#include<iostream>
#include<vector>
using namespace std;
vector<int> a; // 外置状态存储
int n;
void print(){
	for (int i = 0; i < a.size()-1; i++) 
		cout << a[i] << "+";
	cout << a[a.size()-1] << endl;
}
void dfs(int remain, int low){ // 携带的状态信息：影响下一步决策的信息

	if (!remain && a.size() >= 2) {print(); return;}  // 终止条件
	for (int i = low; i <= remain; i++){ // 尝试每种可能
		a.push_back(i);
		dfs(remain - i, i);
		a.pop_back();
	}
}
int main(){
	cin >> n;
	dfs(n, 1);
	return 0;
}