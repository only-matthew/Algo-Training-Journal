#include <bits/stdc++.h>
using namespace std;
int main()
{
    int n;
    cin>>n;
    set<int> a;int temp;
    for(int i=0;i<n;i++)
    {
        cin>>temp;
        a.insert(temp);
    }
    cout<<(int)a.size()<<endl;
    for(auto x:a)
    {
        cout<<x<<' ';
    }
}